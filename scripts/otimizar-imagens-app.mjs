/**
 * Converte pra WebP as imagens que SÓ o app técnico usa.
 *
 * POR QUE: em 2026-10-05 um técnico ficou travado sem conseguir atualizar
 * (disjuntor OTA, "Failed to download") com o bundle em 39 MB — 87% dele
 * era imagem e vídeo, contra 3,2 MB de JavaScript. São PNGs em resolução
 * de desktop (1536x1024, 2094x751) indo pra tela de um celular em campo,
 * às vezes com sinal fraco.
 *
 * REGRAS:
 *
 *  • Teto de 1280 px no lado maior. É o bastante pra uma imagem de largura
 *    total num celular de 430 px a DPR 3; não dá pra reduzir muito mais
 *    sem arriscar nitidez nos fundos que ocupam a tela inteira. O ganho
 *    grande vem do FORMATO, não do tamanho: PNG é péssimo pra conteúdo
 *    fotográfico e com gradiente.
 *
 *  • Imagens usadas em E-MAIL ficam de fora (card.png, logo_favicon.PNG,
 *    carta/header/cardpendencialtz). Os templates rodam no servidor e o
 *    Outlook não renderiza WebP. As três últimas já saem do bundle pela
 *    lista do build-mobile.mjs.
 *
 * O script NÃO apaga o .png de origem nem mexe nas referências — isso é
 * feito à parte, pra a troca ser revisável.
 *
 * Uso: node scripts/otimizar-imagens-app.mjs
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Barra normal: o caminho vai pro sharp-cli como glob (ver execSync abaixo).
const PUBLIC = "public";
const LADO_MAX = 1280;
const QUALIDADE = 82;

/** Só do app — confirmado por grep sem hit em src/lib/email* nem src/app/api/. */
const ALVOS = [
  "banner.png",
  "fundo_img.png",
  "municipio.png",
  "banner_instalação.png",
  "card_disponivel.png",
  "card_instalado.png",
  "card_rejeitado.png",
  "card_andamento.png",
  "logo_app.png",
  "banner_app.png",
  "fundo_tudo.png",
  "mpoperacional.png",
  "minsta.png",
  "menu.png",
  "assinatura.png",
  "nansen.png",
  "logo-marca.PNG",
  "Logo_VIVO.png",
];

const kb = (n) => Math.round(n / 1024);
let antes = 0;
let depois = 0;

for (const nome of ALVOS) {
  const entrada = `${PUBLIC}/${nome}`;
  let tamAntes;
  try {
    tamAntes = statSync(entrada).size;
  } catch {
    console.log(`pulando ${nome} (ausente)`);
    continue;
  }
  const saida = join(PUBLIC, nome.replace(/\.(png|PNG|jpg|jpeg)$/, ".webp"));

  // execSync (e não execFileSync): no Windows o npx é um .cmd, que o
  // spawn do Node não executa direto — dá EINVAL. Caminhos entre aspas
  // porque há nome com acento (banner_instalação.png), e com BARRA NORMAL
  // porque o sharp-cli trata o input como glob, onde "\" é escape.
  //
  // -f/-q são opções GLOBAIS, antes do comando; "--" só serve pra
  // encadear comandos e fazia o sharp-cli não enxergar o input.
  execSync(
    `npx --yes sharp-cli@5 -i "${entrada}" -o "${PUBLIC}" ` +
    `-f webp -q ${QUALIDADE} ` +
    `resize ${LADO_MAX} --fit inside --withoutEnlargement`,
    { stdio: ["ignore", "ignore", "inherit"] }
  );

  const tamDepois = statSync(saida).size;
  antes += tamAntes;
  depois += tamDepois;
  console.log(
    `${nome.padEnd(24)} ${String(kb(tamAntes)).padStart(5)} KB -> ` +
    `${String(kb(tamDepois)).padStart(5)} KB  (-${Math.round(100 - (100 * tamDepois) / tamAntes)}%)`
  );
}

console.log(
  `\nTOTAL: ${kb(antes)} KB -> ${kb(depois)} KB ` +
  `(-${Math.round(100 - (100 * depois) / antes)}%, ${kb(antes - depois)} KB a menos no bundle)`
);
