import { NextRequest, NextResponse } from "next/server";
import { requirePainelRole } from "@/lib/painel-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1.5 });

    // Semeia o token ANTES de qualquer script da página rodar — quando o
    // React monta e o services/api.ts lê o token, ele já está lá.
    await page.evaluateOnNewDocument((tk: string) => {
      window.localStorage.setItem("vistomap.token", tk);
    }, token);

    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 45_000 });
    // Melhor esforço: espera o sinal "dados + mapas prontos" da própria
    // página; se demorar demais, segue assim mesmo (não trava o export).
    await page
      .waitForFunction("window.__PDF_READY__ === true", { timeout: 20_000 })
      .catch(() => {});

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
