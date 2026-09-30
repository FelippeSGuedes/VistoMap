import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Caminhos possíveis do Chromium instalado via apk no Alpine (ver
 *  Dockerfile) — nomes/paths mudaram entre versões do pacote, então
 *  tenta a env var primeiro e cai numa lista antes de desistir. */
function resolveChromiumPath(): string {
  const candidatos = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/lib/chromium/chromium",
  ].filter((p): p is string => !!p);
  const achado = candidatos.find((p) => existsSync(p));
  if (!achado) {
    throw new Error(
      `Chromium não encontrado no container (tentado: ${candidatos.join(", ")}). Verifique se o "apk add chromium" rodou no build da imagem do painel.`
    );
  }
  return achado;
}

/**
 * GET /api/painel/export-pdf — exporta o dashboard "Equipe ao vivo" em PDF
 * (2026-09-30, pedido de campo: "opção de download do Dashboard... bem
 * lindo e organizado"). Abordagem: Puppeteer (Chromium do sistema, ver
 * Dockerfile) renderiza a página /painel/print — que é a MESMA
 * <EquipeAoVivo print/> da tela, só que sem os controles interativos e
 * sem scroll no card de município — e devolve o PDF gerado.
 *
 * Autenticação: o token Bearer de quem chamou este endpoint é reinjetado
 * no localStorage da aba do Puppeteer ANTES de navegar (mesma chave que
 * services/api.ts usa) — assim a página /painel/print autentica sozinha
 * nas próprias chamadas de API, exatamente como o dashboard normal faz.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePainelRole(req, "leitura");
  if (!auth.ok) return auth.response;

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const printParams = new URLSearchParams();
  for (const key of ["inicio", "fim", "dias", "concessionaria", "municipio", "periodoLabel"]) {
    const v = searchParams.get(key);
    if (v) printParams.set(key, v);
  }

  // Loopback direto no próprio container — nunca passa pelo nginx (que só
  // existe na borda externa), então a porta é sempre a interna (PORT do
  // Dockerfile), nunca 443/80.
  const port = process.env.PORT || "3000";
  const printUrl = `http://127.0.0.1:${port}/painel/print?${printParams.toString()}`;

  let browser: import("puppeteer-core").Browser | null = null;
  try {
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.launch({
      executablePath: resolveChromiumPath(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        // Sem GPU de verdade no servidor — sem isto o WebGL do Mapbox não
        // inicializa em Chromium headless e o mapa sai em branco no PDF.
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1.5 });

    // Semeia sessão + token ANTES de qualquer script da página rodar. Só o
    // token não bastava: o guard do /painel lê `vistomap.session` (ver
    // services/auth.ts) e, sem ela, mandava a aba do Puppeteer pra tela de
    // login — o PDF saía com a tela de login (achado em campo 2026-09-30).
    // A sessão é montada aqui a partir das claims do JWT JÁ VALIDADO acima,
    // nunca de algo que o cliente mandou, e vale só os minutos do export.
    const sessao = {
      token,
      tecnico: {
        id: auth.claims.tecnicoId ?? auth.claims.sub,
        nome: "Exportação PDF",
        email: auth.claims.email ?? "",
      },
      expiresAt: Date.now() + 10 * 60_000,
      role: auth.claims.role,
    };
    await page.evaluateOnNewDocument(
      (tk: string, ss: string) => {
        window.localStorage.setItem("vistomap.token", tk);
        window.localStorage.setItem("vistomap.session", ss);
      },
      token,
      JSON.stringify(sessao)
    );

    // NÃO usar networkidle0 aqui (era o bug 2026-09-30, "Navigation timeout
    // of 45000 ms exceeded"): ele exige a rede 100% parada, e esta página
    // nunca chega nisso — o mapa fica pedindo tiles e o layout do painel
    // tem polling de notificações a cada 10s. Quem diz "terminei" é a
    // própria página, pela flag __PDF_READY__ logo abaixo.
    await page.goto(printUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForFunction("window.__PDF_READY__ === true", { timeout: 45_000 });
    } catch {
      // Melhor esforço: gera o PDF com o que estiver na tela em vez de
      // falhar o export inteiro por causa de um mapa lento.
      console.warn("[api/painel/export-pdf] __PDF_READY__ não chegou a tempo; gerando assim mesmo");
    }

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", bottom: "12mm", left: "8mm", right: "8mm" },
    });

    const dataHoje = new Date().toISOString().slice(0, 10);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="vistomap-equipe-ao-vivo-${dataHoje}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[api/painel/export-pdf] error", err);
    return NextResponse.json(
      { message: "Falha ao gerar PDF do dashboard", error: String(err) },
      { status: 500 }
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
