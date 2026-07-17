import { NextRequest, NextResponse } from "next/server";
import { verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";
import { fetchRecentErrors, countErrorsSince } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ServiceCheck {
  nome: string;
  ok: boolean;
  detalhe: string;
  tempo_ms: number | null;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

async function checkHttp(nome: string, url: string): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    const tempo_ms = Date.now() - start;
    return {
      nome,
      ok: res.status < 500,
      detalhe: `HTTP ${res.status}`,
      tempo_ms,
    };
  } catch (err) {
    return {
      nome,
      ok: false,
      detalhe: err instanceof Error ? err.message : String(err),
      tempo_ms: Date.now() - start,
    };
  }
}

async function checkDb(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await withTimeout(query("SELECT 1"), 5000);
    return { nome: "Banco de dados", ok: true, detalhe: "conectado", tempo_ms: Date.now() - start };
  } catch (err) {
    return {
      nome: "Banco de dados",
      ok: false,
      detalhe: err instanceof Error ? err.message : String(err),
      tempo_ms: Date.now() - start,
    };
  }
}

interface WorkerRow {
  ultima_atividade: string | null;
  erros_recentes: number;
}

async function checkWorker(): Promise<{ check: ServiceCheck; ultimaAtividade: string | null }> {
  const start = Date.now();
  try {
    const rows = await withTimeout(
      query<WorkerRow>(
        `SELECT MAX(updated_at) AS ultima_atividade,
                SUM(CASE WHEN project_status = 'ERRO' THEN 1 ELSE 0 END) AS erros_recentes
           FROM glpi_plugin_vistomap_projects
          WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      ),
      5000
    );
    const row = rows[0];
    const ultimaAtividade = row?.ultima_atividade ?? null;
    const minutosAtras = ultimaAtividade
      ? Math.round((Date.now() - new Date(ultimaAtividade.replace(" ", "T") + "Z").getTime()) / 60000)
      : null;
    const erros = Number(row?.erros_recentes ?? 0);
    return {
      check: {
        nome: "Worker (geração de PDF)",
        // Sinal indireto: nao ha' heartbeat direto do worker, so' sabemos se
        // ele tocou em algum projeto nas ultimas 24h. Sem atividade recente
        // nao significa necessariamente que esta' fora do ar (pode so' nao
        // ter tido vistoria pra processar) — por isso "ok" fica true aqui,
        // e o dado bruto (ultima atividade) fica visivel pro admin decidir.
        ok: erros === 0,
        detalhe:
          ultimaAtividade == null
            ? "sem atividade nas últimas 24h"
            : `última atividade há ${minutosAtras} min · ${erros} erro(s) de geração nas 24h`,
        tempo_ms: Date.now() - start,
      },
      ultimaAtividade,
    };
  } catch (err) {
    return {
      check: {
        nome: "Worker (geração de PDF)",
        ok: false,
        detalhe: err instanceof Error ? err.message : String(err),
        tempo_ms: Date.now() - start,
      },
      ultimaAtividade: null,
    };
  }
}

async function checkOta(): Promise<{ check: ServiceCheck; versao: string | null }> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://vistomap.nansen.com.br/ota/latest.json", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        check: { nome: "OTA (app técnico)", ok: false, detalhe: `HTTP ${res.status}`, tempo_ms: Date.now() - start },
        versao: null,
      };
    }
    const data = (await res.json()) as { version?: string };
    return {
      check: {
        nome: "OTA (app técnico)",
        ok: true,
        detalhe: data.version ? `versão publicada: ${data.version}` : "manifesto sem versão",
        tempo_ms: Date.now() - start,
      },
      versao: data.version ?? null,
    };
  } catch (err) {
    return {
      check: {
        nome: "OTA (app técnico)",
        ok: false,
        detalhe: err instanceof Error ? err.message : String(err),
        tempo_ms: Date.now() - start,
      },
      versao: null,
    };
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }
  try {
    const claims = await verifySessionJwt(token);
    if (claims.role !== "admin") {
      return NextResponse.json({ message: "Acesso restrito ao admin" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const [dbCheck, glpiCheck, appCheck, otaResult, workerResult, errosRecentes, erros1h, erros24h] =
    await Promise.all([
      checkDb(),
      checkHttp("GLPI", "https://gioc.nansen.com.br/"),
      checkHttp("App técnico", "https://vistomap.nansen.com.br/app/"),
      checkOta(),
      checkWorker(),
      fetchRecentErrors(50).catch(() => []),
      countErrorsSince(1).catch(() => 0),
      countErrorsSince(24).catch(() => 0),
    ]);

  // "Painel" é este próprio processo respondendo — se chegou até aqui, está up.
  const painelCheck: ServiceCheck = { nome: "Painel", ok: true, detalhe: "respondendo", tempo_ms: 0 };

  const servicos = [painelCheck, appCheck, glpiCheck, dbCheck, otaResult.check, workerResult.check];
  const saudeGeral = servicos.every((s) => s.ok) ? "saudavel" : "atencao";

  return NextResponse.json({
    checadoEm: new Date().toISOString(),
    saudeGeral,
    servicos,
    otaVersao: otaResult.versao,
    workerUltimaAtividade: workerResult.ultimaAtividade,
    erros: {
      ultimaHora: erros1h,
      ultimas24h: erros24h,
      recentes: errosRecentes,
    },
  });
}
