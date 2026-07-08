import "server-only";
import { execute, query } from "./db";

/**
 * Lib expediente — turno de trabalho do tecnico.
 *
 * Tecnico inicia expediente (com aceite LGPD na 1a vez) e finaliza. Apenas
 * durante expediente aberto o app tecnico pinga GPS e pode iniciar vistorias.
 * Fora de expediente: rastreio off, sem obrigacao trabalhista.
 *
 * Schema: mobile/migrations/002_expediente.sql
 */

export interface ExpedienteAtual {
  id: number;
  users_id: number;
  inicio_at: string;
  fim_at: string | null;
  pausa_almoco_inicio: string | null;
  pausa_almoco_fim: string | null;
  consentimento_lgpd_at: string | null;
  emPausa: boolean;
  emAndamento: boolean;
}

interface ExpedienteRow {
  id: number;
  users_id: number;
  inicio_at: string;
  fim_at: string | null;
  pausa_almoco_inicio: string | null;
  pausa_almoco_fim: string | null;
  consentimento_lgpd_at: string | null;
}

function mapRow(r: ExpedienteRow): ExpedienteAtual {
  const emPausa =
    !!r.pausa_almoco_inicio && !r.pausa_almoco_fim;
  return {
    id: r.id,
    users_id: r.users_id,
    inicio_at: r.inicio_at,
    fim_at: r.fim_at,
    pausa_almoco_inicio: r.pausa_almoco_inicio,
    pausa_almoco_fim: r.pausa_almoco_fim,
    consentimento_lgpd_at: r.consentimento_lgpd_at,
    emPausa,
    emAndamento: r.fim_at == null,
  };
}

/** Retorna expediente em aberto (fim_at IS NULL) do usuario, ou null. */
export async function expedienteAtual(
  usersId: number
): Promise<ExpedienteAtual | null> {
  const rows = await query<ExpedienteRow>(
    `SELECT id, users_id, inicio_at, fim_at, pausa_almoco_inicio, pausa_almoco_fim, consentimento_lgpd_at
       FROM glpi_plugin_vistomap_expediente
      WHERE users_id = ? AND fim_at IS NULL
      ORDER BY inicio_at DESC LIMIT 1`,
    [usersId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Retorna se usuario ja aceitou LGPD alguma vez. */
export async function jaAceitouLGPD(usersId: number): Promise<boolean> {
  const rows = await query<{ users_id: number }>(
    `SELECT users_id FROM glpi_plugin_vistomap_lgpd_consent WHERE users_id = ? LIMIT 1`,
    [usersId]
  );
  return rows.length > 0;
}

/** Registra aceite LGPD do usuario (idempotente). */
export async function registrarConsentimentoLGPD(
  usersId: number,
  dispositivoInfo?: string | null
): Promise<void> {
  await execute(
    `INSERT INTO glpi_plugin_vistomap_lgpd_consent (users_id, aceito_at, dispositivo_info)
       VALUES (?, NOW(), ?)
     ON DUPLICATE KEY UPDATE aceito_at = aceito_at`,
    [usersId, dispositivoInfo ?? null]
  );
}

export interface IniciarExpedienteInput {
  usersId: number;
  dispositivoInfo?: string | null;
  aceitarLGPDAgora?: boolean;
}

export interface IniciarExpedienteResult {
  ok: boolean;
  reason?: "ja-aberto" | "lgpd-pendente";
  expediente?: ExpedienteAtual;
  precisaAceiteLGPD?: boolean;
}

/**
 * Inicia expediente. Falha se:
 * - Ja ha um aberto (retorna o existente)
 * - LGPD nunca foi aceito e nao foi passado aceitarLGPDAgora
 */
export async function iniciarExpediente(
  input: IniciarExpedienteInput
): Promise<IniciarExpedienteResult> {
  const aberto = await expedienteAtual(input.usersId);
  if (aberto) {
    return { ok: false, reason: "ja-aberto", expediente: aberto };
  }
  const aceitou = await jaAceitouLGPD(input.usersId);
  if (!aceitou && !input.aceitarLGPDAgora) {
    return { ok: false, reason: "lgpd-pendente", precisaAceiteLGPD: true };
  }
  if (input.aceitarLGPDAgora && !aceitou) {
    await registrarConsentimentoLGPD(input.usersId, input.dispositivoInfo);
  }
  const consentTs = aceitou || input.aceitarLGPDAgora ? new Date() : null;
  const result = await execute(
    `INSERT INTO glpi_plugin_vistomap_expediente
       (users_id, inicio_at, consentimento_lgpd_at, dispositivo_info)
     VALUES (?, NOW(), ?, ?)`,
    [
      input.usersId,
      consentTs ? consentTs.toISOString().slice(0, 19).replace("T", " ") : null,
      input.dispositivoInfo ?? null,
    ]
  );
  const novo = await expedienteAtual(input.usersId);
  if (!novo) throw new Error("Falha ao recuperar expediente recem-criado");
  void result;
  return { ok: true, expediente: novo };
}

/** Finaliza expediente em aberto. No-op se nao houver. */
export async function finalizarExpediente(
  usersId: number
): Promise<{ ok: boolean; expedienteId?: number }> {
  const aberto = await expedienteAtual(usersId);
  if (!aberto) return { ok: false };
  // Fecha pausa se estava em pausa
  if (aberto.emPausa) {
    await execute(
      `UPDATE glpi_plugin_vistomap_expediente
          SET pausa_almoco_fim = NOW()
        WHERE id = ?`,
      [aberto.id]
    );
  }
  await execute(
    `UPDATE glpi_plugin_vistomap_expediente
        SET fim_at = NOW()
      WHERE id = ?`,
    [aberto.id]
  );
  return { ok: true, expedienteId: aberto.id };
}

/**
 * Toggle pausa almoco. NÃO USADA pelo fluxo atual — expediente automático é
 * contínuo, sem pausa (decisão operacional 2026-07). Mantida só porque
 * /api/expediente/pausa (no-op, legado) chamava isso antes; hoje ninguém
 * chama. Não remover sem checar se algum bundle antigo ainda depende dela.
 */
export async function togglePausaAlmoco(
  usersId: number
): Promise<{ ok: boolean; emPausa?: boolean }> {
  const aberto = await expedienteAtual(usersId);
  if (!aberto) return { ok: false };
  if (aberto.emPausa) {
    await execute(
      `UPDATE glpi_plugin_vistomap_expediente
          SET pausa_almoco_fim = NOW()
        WHERE id = ?`,
      [aberto.id]
    );
    return { ok: true, emPausa: false };
  }
  await execute(
    `UPDATE glpi_plugin_vistomap_expediente
        SET pausa_almoco_inicio = NOW(), pausa_almoco_fim = NULL
      WHERE id = ?`,
    [aberto.id]
  );
  return { ok: true, emPausa: true };
}

/* ════════════════════════════════════════════════════════════════════════
   EXPEDIENTE AUTOMÁTICO (2026-07)
   O expediente deixou de ser manual (iniciar/pausa/finalizar) — os técnicos
   não usavam direito. Agora ele é derivado do comportamento real:
   - Abre sozinho no primeiro sinal do dia (GPS/abrir app/iniciar vistoria),
     desde que DENTRO da janela configurada e com LGPD aceito (1x, tabela
     glpi_plugin_vistomap_lgpd_consent — o consentimento continua sendo a
     base legal do rastreio).
   - Fecha sozinho: registros pendurados (dia anterior/pós-janela) são
     encerrados com fim = último ping GPS do dia (fallback: fim da janela).
   - Janela configurável no painel (default 07:30–18:00, sem fim de semana).
   ════════════════════════════════════════════════════════════════════════ */

export interface ExpedienteConfig {
  /** "HH:MM" início da janela de rastreio. */
  inicio: string;
  /** "HH:MM" fim da janela de rastreio. */
  fim: string;
  /** Rastrear aos sábados/domingos? */
  fimDeSemana: boolean;
}

const CONFIG_DEFAULTS: ExpedienteConfig = {
  inicio: "07:30",
  fim: "18:00",
  fimDeSemana: false,
};

let configTableEnsured = false;
async function ensureConfigTable(): Promise<void> {
  if (configTableEnsured) return;
  await execute(
    `CREATE TABLE IF NOT EXISTS glpi_plugin_vistomap_config (
       chave VARCHAR(64) NOT NULL PRIMARY KEY,
       valor VARCHAR(255) NOT NULL,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  configTableEnsured = true;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function getExpedienteConfig(): Promise<ExpedienteConfig> {
  await ensureConfigTable();
  const rows = await query<{ chave: string; valor: string }>(
    `SELECT chave, valor FROM glpi_plugin_vistomap_config
      WHERE chave IN ('expediente_inicio','expediente_fim','expediente_fds')`
  );
  const map = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  const inicio = HHMM_RE.test(map.expediente_inicio ?? "")
    ? map.expediente_inicio
    : CONFIG_DEFAULTS.inicio;
  const fim = HHMM_RE.test(map.expediente_fim ?? "")
    ? map.expediente_fim
    : CONFIG_DEFAULTS.fim;
  return {
    inicio,
    fim,
    fimDeSemana: map.expediente_fds === "1",
  };
}

export async function setExpedienteConfig(
  cfg: Partial<ExpedienteConfig>
): Promise<ExpedienteConfig> {
  await ensureConfigTable();
  const pairs: Array<[string, string]> = [];
  if (cfg.inicio !== undefined) {
    if (!HHMM_RE.test(cfg.inicio)) throw new Error("inicio inválido (HH:MM)");
    pairs.push(["expediente_inicio", cfg.inicio]);
  }
  if (cfg.fim !== undefined) {
    if (!HHMM_RE.test(cfg.fim)) throw new Error("fim inválido (HH:MM)");
    pairs.push(["expediente_fim", cfg.fim]);
  }
  if (cfg.fimDeSemana !== undefined) {
    pairs.push(["expediente_fds", cfg.fimDeSemana ? "1" : "0"]);
  }
  for (const [chave, valor] of pairs) {
    await execute(
      `INSERT INTO glpi_plugin_vistomap_config (chave, valor) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [chave, valor]
    );
  }
  return getExpedienteConfig();
}

/** Data/hora atuais em America/Sao_Paulo (independente do TZ do container). */
function agoraSP(): { ymd: string; hhmm: string; diaSemana: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
    get("weekday") as "Sun"
  ] ?? 0;
  // en-CA + hour12:false pode render "24" à meia-noite — normaliza.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${hour}:${get("minute")}`,
    diaSemana: wd,
  };
}

export interface JanelaStatus {
  dentro: boolean;
  motivo?: "fds" | "antes" | "depois";
  config: ExpedienteConfig;
  agora: { ymd: string; hhmm: string };
}

export async function janelaRastreio(): Promise<JanelaStatus> {
  const config = await getExpedienteConfig();
  const { ymd, hhmm, diaSemana } = agoraSP();
  const agora = { ymd, hhmm };
  if (!config.fimDeSemana && (diaSemana === 0 || diaSemana === 6)) {
    return { dentro: false, motivo: "fds", config, agora };
  }
  if (hhmm < config.inicio) return { dentro: false, motivo: "antes", config, agora };
  if (hhmm >= config.fim) return { dentro: false, motivo: "depois", config, agora };
  return { dentro: true, config, agora };
}

/**
 * Fecha expedientes pendurados do usuário (ou de todos, se usersId omitido):
 * abertos que começaram num dia anterior. fim = último ping GPS daquele dia;
 * sem ping, fim = início + janela (ou o próprio início, o que for maior).
 */
export async function fecharExpedientesPendurados(usersId?: number): Promise<number> {
  const cfg = await getExpedienteConfig();
  const params: unknown[] = [];
  let where = `fim_at IS NULL AND DATE(inicio_at) < CURDATE()`;
  if (usersId != null) {
    where += ` AND users_id = ?`;
    params.push(usersId);
  }
  const abertos = await query<{ id: number; users_id: number; inicio_at: string }>(
    `SELECT id, users_id, inicio_at FROM glpi_plugin_vistomap_expediente WHERE ${where}`,
    params
  );
  for (const e of abertos) {
    await execute(
      `UPDATE glpi_plugin_vistomap_expediente
          SET fim_at = GREATEST(
                inicio_at,
                COALESCE(
                  (SELECT MAX(l.created_at) FROM glpi_plugin_vistomap_locations l
                    WHERE l.users_id = ? AND DATE(l.created_at) = DATE(inicio_at)),
                  TIMESTAMP(DATE(inicio_at), ?)
                )
              ),
              pausa_almoco_fim = COALESCE(pausa_almoco_fim, pausa_almoco_inicio)
        WHERE id = ?`,
      [e.users_id, `${cfg.fim}:00`, e.id]
    );
  }
  return abertos.length;
}

export interface EnsureResult {
  permitido: boolean;
  motivo?: "fds" | "antes" | "depois" | "lgpd-pendente";
  expediente?: ExpedienteAtual | null;
  janela: JanelaStatus;
}

/**
 * Coração do expediente automático. Chamado pelos gates (GPS ping, iniciar
 * vistoria, abrir app):
 *  1. Fecha pendurados de dias anteriores.
 *  2. Fora da janela → não permite (e fecha o expediente de hoje se a janela
 *     já encerrou).
 *  3. Dentro da janela: abre expediente do dia se não houver (exige LGPD 1x).
 */
export async function ensureExpedienteAuto(
  usersId: number,
  dispositivoInfo?: string | null
): Promise<EnsureResult> {
  await fecharExpedientesPendurados(usersId);
  const janela = await janelaRastreio();
  let aberto = await expedienteAtual(usersId);

  if (!janela.dentro) {
    // Janela do dia acabou → encerra o expediente de hoje no horário-limite.
    if (aberto && janela.motivo === "depois") {
      await execute(
        `UPDATE glpi_plugin_vistomap_expediente
            SET fim_at = GREATEST(inicio_at, TIMESTAMP(CURDATE(), ?)),
                pausa_almoco_fim = COALESCE(pausa_almoco_fim, pausa_almoco_inicio)
          WHERE id = ?`,
        [`${janela.config.fim}:00`, aberto.id]
      );
      aberto = null;
    }
    return { permitido: false, motivo: janela.motivo, expediente: aberto, janela };
  }

  if (!aberto) {
    const aceitou = await jaAceitouLGPD(usersId);
    if (!aceitou) {
      return { permitido: false, motivo: "lgpd-pendente", expediente: null, janela };
    }
    await execute(
      `INSERT INTO glpi_plugin_vistomap_expediente
         (users_id, inicio_at, consentimento_lgpd_at, dispositivo_info)
       VALUES (?, NOW(), NOW(), ?)`,
      [usersId, dispositivoInfo ?? "auto"]
    );
    aberto = await expedienteAtual(usersId);
  }
  return { permitido: true, expediente: aberto, janela };
}

/** Listar expedientes abertos AGORA (admin). */
export async function expedientesAtivos(): Promise<
  Array<ExpedienteAtual & { tecnico_nome: string }>
> {
  const rows = await query<
    ExpedienteRow & {
      firstname: string | null;
      realname: string | null;
      username: string;
    }
  >(
    `SELECT e.id, e.users_id, e.inicio_at, e.fim_at, e.pausa_almoco_inicio,
            e.pausa_almoco_fim, e.consentimento_lgpd_at,
            u.firstname, u.realname, u.name AS username
       FROM glpi_plugin_vistomap_expediente e
       INNER JOIN glpi_users u ON u.id = e.users_id
      WHERE e.fim_at IS NULL
      ORDER BY e.inicio_at DESC`
  );
  return rows.map((r) => ({
    ...mapRow(r),
    tecnico_nome:
      `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.username,
  }));
}
