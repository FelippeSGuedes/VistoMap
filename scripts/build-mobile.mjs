// Build do app TÉCNICO empacotado no APK (Capacitor) — export estático offline.
//
// O que faz:
//  1. "Esconde" temporariamente as pastas que NÃO entram no bundle mobile e
//     que quebrariam o `output: export` (rotas /api e /painel são server-side,
//     e /vistorias/[id] é rota dinâmica — o app usa /vistoria?id= no mobile).
//  2. Roda `next build` com BUILD_VARIANT=mobile (output: export → pasta out/).
//  3. Copia out/ para mobile/www (webDir do Capacitor).
//  4. RESTAURA as pastas escondidas, mesmo se o build falhar.
//
// Pré-requisito: NEXT_PUBLIC_MAPBOX_TOKEN no ambiente (ou .env) — necessário
// no build pois é baked no bundle.
//
// Uso: npm run build:mobile  →  depois  npx cap sync android

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STASH = path.join(ROOT, ".mobile-build-stash");

// Pastas removidas só durante o build mobile (caminhos relativos ao ROOT).
const EXCLUDE = [
  "src/app/api",
  "src/app/painel",
  "src/app/vistorias/[id]",
];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://vistomap.nansen.com.br/app/api";

// URL base dos postes (Fastify :3001). No nginx, /postes → :3001 — sem o
// prefixo /app/api que a API do Next usa. Deriva automaticamente o origin.
let POSTES_URL = process.env.NEXT_PUBLIC_POSTES_URL;
if (!POSTES_URL) {
  try { POSTES_URL = new URL(API_URL).origin; } catch { POSTES_URL = ""; }
}

function stash() {
  fs.mkdirSync(STASH, { recursive: true });
  for (const rel of EXCLUDE) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(STASH, rel.replace(/[\\/]/g, "__"));
    fs.renameSync(src, dest);
    console.log(`[mobile] escondido: ${rel}`);
  }
}

function restore() {
  if (!fs.existsSync(STASH)) return;
  for (const rel of EXCLUDE) {
    const dest = path.join(STASH, rel.replace(/[\\/]/g, "__"));
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.renameSync(dest, src);
    console.log(`[mobile] restaurado: ${rel}`);
  }
  fs.rmSync(STASH, { recursive: true, force: true });
}

// Assets de /public usados SÓ pelo painel admin (nunca aparecem no app
// técnico) — o export estático inclui todo /public de qualquer forma, mas
// não faz sentido inflar o zip OTA do técnico (baixado no campo, às vezes em
// sinal fraco) com branding administrativo. Confirmado via grep: sem
// nenhuma referência fora de src/app/painel/**.
//
// 2026-08-25: lista estava desatualizada — vários fundos de card adicionados
// nas últimas sessões nunca foram incluídos aqui, inflando o app técnico em
// ~35MB de branding que ele nunca exibe. Revalidado com o mesmo critério
// (grep sem hit fora de src/app/painel/**) antes de adicionar.
//
// 2026-08-26: car.glb (17MB) chegou a sair do projeto e voltou — o que
// quebrava o modelo era escala/transformação, não o arquivo. Continua sendo
// só do painel (mapa 3D), então continua fora do bundle do técnico.
const PAINEL_ONLY_ASSETS = [
  "vis.png",
  "login_painel.png",
  "logo-vistomap.png",
  "car.glb",
  "viswhite.png",
  "vistoriadoverde.png",
  "vistoriadoverdeblack.png",
  "graphwhite.png",
  "graphblack.png",
  "cmpblack.png",
  "cmpwhite.png",
  "avistoriarlaranja.png",
  "avistoriarlaranjablack.png",
  "avistoriarazul.png",
  "avistoriarazulblack.png",
  "cardconwhi.png",
  "cardconbla.png",
  "visrealizwht.png",
  "visrealizbl.png",
];

function copyOutToWww() {
  const out = path.join(ROOT, "out");
  const www = path.join(ROOT, "mobile", "www");
  if (!fs.existsSync(out)) {
    throw new Error("Pasta out/ não foi gerada — o export falhou?");
  }
  fs.rmSync(www, { recursive: true, force: true });
  fs.mkdirSync(www, { recursive: true });
  fs.cpSync(out, www, {
    recursive: true,
    filter: (src) => !PAINEL_ONLY_ASSETS.includes(path.basename(src)),
  });
  console.log(`[mobile] copiado out/ → mobile/www (excluindo assets só-painel)`);
}

console.log("[mobile] iniciando build estático do app técnico…");
if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  console.warn(
    "[mobile] AVISO: NEXT_PUBLIC_MAPBOX_TOKEN ausente — o mapa não vai funcionar no APK."
  );
}

try {
  stash();
  execSync("npx next build", {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      BUILD_VARIANT: "mobile",
      NEXT_PUBLIC_BASE_PATH: "",
      NEXT_PUBLIC_USE_BASE_PATH: "false",
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_POSTES_URL: POSTES_URL,
    },
  });
  copyOutToWww();
  console.log("[mobile] OK. Agora rode: npx cap sync android");
} catch (err) {
  console.error("[mobile] build falhou:", err?.message ?? err);
  process.exitCode = 1;
} finally {
  restore();
}
