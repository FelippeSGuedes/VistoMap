import { NextResponse } from "next/server";
import { getVistoria } from "@/lib/glpi/equipments";
import { verifySessionJwt } from "@/lib/jwt";
import { ensureExpedienteAuto } from "@/lib/expediente";
import { auditInsert } from "@/lib/glpi/audit";
import { execute } from "@/lib/db";
import { TABLE_FIELDS, SITUACAO_COLUMN, SITUACAO_EM_VISTORIA } from "@/lib/glpi/constants";
import { ensureOverrideTable } from "@/lib/ensureOverrideTable";
import { logError } from "@/lib/observability";
import { fetchDevolucaoPendente, devolucaoEhDeOutroDia } from "@/lib/glpi/devolucoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Raio (m) dentro do qual o técnico é considerado "no local do equipamento". */
const RAIO_M = 100;

function parseId(raw: string): number | null {
  const cleaned = raw.replace(/^NE-/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Haversine — distância em metros entre 2 coordenadas. */
function distanciaMetros(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

interface IniciarBody {
  latitude?: number;
  longitude?: number;
  forcar?: boolean;
  justificativa?: string;
  /** true = operação veio da fila offline; revalida e audita, nunca bloqueia. */
  offline?: boolean;
}

/**
 * Iniciar vistoria — agora com geofence de presença.
 *
 * Regras:
 *  • Exige expediente aberto (gate existente).
 *  • Equipamento precisa ter coordenada cadastrada (senão bloqueia).
 *  • Técnico precisa estar a ≤ RAIO_M do equipamento.
 *  • Fora do raio / sem GPS: só inicia com `forcar:true` + `justificativa`,
 *    e a exceção é registrada na auditoria.
 *  • Sucesso → situação = Em Vistoria (2) + audit "vistoria-iniciada".
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id == null) {
    return NextResponse.json({ message: "ID inválido" }, { status: 400 });
  }

  // Body com GPS do aparelho + eventual override.
  let body: IniciarBody = {};
  try {
    body = (await request.json()) as IniciarBody;
  } catch {
    body = {};
  }
  const devLat = typeof body.latitude === "number" ? body.latitude : null;
  const devLng = typeof body.longitude === "number" ? body.longitude : null;
  const forcar = body.forcar === true;
  const offline = body.offline === true;
  const justificativa = (body.justificativa ?? "").trim();

  // Gating: expediente aberto + identifica ator.
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  let actorId: number | null = null;
  let actorNome = "Tecnico";
  if (token) {
    try {
      const claims = await verifySessionJwt(token);
      const userId = Number(claims.sub);
      actorNome = claims.email ?? "Tecnico";
      if (userId > 0) {
        actorId = userId;
        // Expediente automático: abre sozinho se dentro da janela. Fora da
        // janela (fds / antes / depois) ou sem LGPD → bloqueia o início.
        const gate = await ensureExpedienteAuto(userId);
        if (!gate.permitido) {
          const cfg = gate.janela.config;
          const msg =
            gate.motivo === "lgpd-pendente"
              ? "Aceite o termo de consentimento (LGPD) no app antes de iniciar vistorias."
              : gate.motivo === "fds"
                ? "Vistorias não podem ser iniciadas em fins de semana."
                : `Fora do horário de expediente (${cfg.inicio}–${cfg.fim}).`;
          return NextResponse.json(
            { message: msg, motivo: gate.motivo },
            { status: 403 }
          );
        }

        // Devolução pendente de um dia ANTERIOR → bloqueia iniciar vistoria
        // NOVA até resolver. No mesmo dia é só lembrete (não bloqueia) — só
        // vira obrigatório a partir do primeiro acesso do dia seguinte.
        const devolucaoPendente = await fetchDevolucaoPendente(userId);
        if (devolucaoPendente && devolucaoEhDeOutroDia(devolucaoPendente.criadoEm)) {
          return NextResponse.json(
            {
              message: "Você tem uma vistoria devolvida pra correção — resolva antes de iniciar outra.",
              motivo: "devolucao-pendente",
              devolucaoId: devolucaoPendente.id,
              devolucaoVistoriaId: devolucaoPendente.vistoriaId,
            },
            { status: 403 }
          );
        }
      }
    } catch {
      /* token inválido cai na verificacao normal abaixo */
    }
  }

  try {
    const vistoria = await getVistoria(id);
    if (!vistoria) {
      return NextResponse.json({ message: "Vistoria não encontrada" }, { status: 404 });
    }

    // ── Geofence ───────────────────────────────────────────────────────
    const equipLat = vistoria.latitude;
    const equipLng = vistoria.longitude;

    let distancia: number | null = null;
    let exceptionLabel: string | null = null;
    // Precisa de aprovação do admin — presença não pôde ser confirmada
    // (fora do raio ou sem GPS), seja pedido online forçado, seja um
    // "iniciar" sincronizado depois da fila offline. Antes, o offline caía
    // direto pra "Em Vistoria" sem aprovação nenhuma — bastava o app cair em
    // modo offline (rede ruim, timeout) pra pular a checagem de presença
    // por completo, mesmo o técnico estando longe do equipamento.
    let precisaAprovacao = false;

    // Equipamento sem coordenada → bloqueia online; offline segue marcado
    // (problema de cadastro do equipamento, não de presença do técnico).
    if (equipLat == null || equipLng == null) {
      if (!offline) {
        return NextResponse.json(
          {
            message:
              "Equipamento sem coordenada cadastrada. Solicite o cadastro ao administrador.",
            semCoordenada: true,
          },
          { status: 422 }
        );
      }
      exceptionLabel = "SEM COORDENADA";
    } else if (devLat != null && devLng != null) {
      distancia = distanciaMetros({ lat: devLat, lng: devLng }, { lat: equipLat, lng: equipLng });
      if (distancia > RAIO_M) {
        exceptionLabel = `FORA DO RAIO (${distancia} m)`;
        if (!offline && !forcar) {
          return NextResponse.json(
            {
              message: `Você está a ${distancia} m do equipamento. Aproxime-se para iniciar.`,
              foraDoRaio: true,
              distancia_m: distancia,
              raio_m: RAIO_M,
            },
            { status: 422 }
          );
        }
        if (!offline && !justificativa) {
          return NextResponse.json(
            { message: "Justificativa obrigatória para iniciar fora do raio.", precisaJustificativa: true },
            { status: 400 }
          );
        }
        precisaAprovacao = true;
      }
    } else {
      // Sem GPS do aparelho.
      exceptionLabel = "SEM GPS";
      if (!offline && !forcar) {
        return NextResponse.json(
          {
            message: "Não foi possível obter sua localização. Ative o GPS e tente novamente.",
            semGps: true,
          },
          { status: 422 }
        );
      }
      if (!offline && !justificativa) {
        return NextResponse.json(
          { message: "Justificativa obrigatória para iniciar sem GPS.", precisaJustificativa: true },
          { status: 400 }
        );
      }
      precisaAprovacao = true;
    }

    // ── Override → cria pedido de aprovação (não inicia imediatamente) ──
    // Vale tanto pro forcar online quanto pro sync da fila offline: presença
    // não confirmada sempre passa por um admin, nunca inicia direto sozinha.
    if (precisaAprovacao) {
      await ensureOverrideTable();
      const { insertId } = await execute(
        `INSERT INTO \`glpi_plugin_vistomap_override_requests\`
         (vistoria_id, users_id, equipamento, tecnico_nome, justificativa, status, distancia_m, exception_label)
         VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?, ?)`,
        [id, actorId ?? 0, vistoria.equipamento ?? `NE-${id}`, actorNome, justificativa, distancia, exceptionLabel]
      );
      const motivoTexto = offline
        ? "sincronizado da fila offline, sem justificativa (dispositivo sem conexão no momento)"
        : `justificativa: ${justificativa}`;
      void auditInsert({
        ator: { id: actorId ?? 0, nome: actorNome, role: "tecnico" },
        acao: "override-solicitado",
        alvo: { tipo: "vistoria", id: String(id), label: vistoria.equipamento ?? `NE-${id}` },
        descricao: `Solicitação de início fora do local enviada. ${exceptionLabel} — ${motivoTexto}`,
      });
      return NextResponse.json({ pending: true, requestId: insertId }, { status: 202 });
    }

    // ── Atualiza situação → Em Vistoria (2) ────────────────────────────
    await execute(
      `UPDATE \`${TABLE_FIELDS}\` SET \`${SITUACAO_COLUMN}\` = ? WHERE items_id = ?`,
      [SITUACAO_EM_VISTORIA, id]
    );

    // ── Auditoria ──────────────────────────────────────────────────────
    if (actorId) {
      const tag = offline ? "(offline) " : "";
      const just = justificativa || (offline ? "validado no app (offline)" : "");
      const descricao = exceptionLabel
        ? `${tag}Vistoria iniciada ⚠ ${exceptionLabel}${just ? ` — justificativa: ${just}` : ""}`
        : `${tag}Vistoria iniciada no local${distancia != null ? ` (${distancia} m)` : ""}`;
      void auditInsert({
        ator: { id: actorId, nome: actorNome, role: "tecnico" },
        acao: "vistoria-iniciada",
        alvo: { tipo: "vistoria", id: String(id), label: vistoria.equipamento ?? `NE-${id}` },
        descricao,
      });
    }

    return NextResponse.json({
      ok: true,
      equipamento: vistoria.equipamento,
      distancia_m: distancia,
      foraDoRaio: !!exceptionLabel,
    });
  } catch (error) {
    console.error("[api/vistorias/:id/iniciar] error", error);
    void logError("app", "vistorias/:id/iniciar", error, { id });
    return NextResponse.json(
      { message: "Falha ao iniciar vistoria", error: String(error) },
      { status: 500 }
    );
  }
}
