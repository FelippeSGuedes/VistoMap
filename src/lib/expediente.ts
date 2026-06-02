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

/** Toggle pausa almoco. Se em pausa → fecha pausa. Senao → abre. */
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
