import "server-only";
import { execute, query } from "@/lib/db";
import { listVistorias } from "./equipments";
import { fetchDevolucoes } from "./devolucoes";
import { SITUACAO_EM_VISTORIA, SITUACAO_EM_DESLOCAMENTO } from "./constants";
import { hojeBrasiliaISO } from "@/lib/timezone";

/**
 * Histórico diário dos 5 KPIs do "Resumo operacional" (dashboard do
 * técnico) — achado 2026-10-01: a sparkline de "tendência 7 dias" dos 4
 * cards existentes (Pendentes/Concluídas/Revisitas/Devoluções) sempre foi
 * mock (MOCK_STATS em utils/mock.ts) — nunca existiu snapshot real. Esta
 * tabela + `registrarSnapshotDiario()` (chamado 1x/dia por cron, ver
 * /api/cron/dashboard-snapshot) substituem isso por histórico de verdade,
 * e adicionam um 5º KPI (Repetidores: pendentes cujo tipo de equipamento é
 * Repetidor — pedido de campo no mesmo dia).
 */
const TABLE = "glpi_plugin_vistomap_dashboard_snapshot";

let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      users_id INT NOT NULL,
      dia DATE NOT NULL,
      pendentes INT NOT NULL DEFAULT 0,
      concluidas INT NOT NULL DEFAULT 0,
      reprovadas INT NOT NULL DEFAULT 0,
      devolucoes INT NOT NULL DEFAULT 0,
      repetidores INT NOT NULL DEFAULT 0,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_snapshot_user_dia (users_id, dia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

/**
 * Roda 1x/dia (cron externo). Reaproveita a MESMA lógica/funções que já
 * alimentam o dashboard ao vivo (listVistorias/fetchDevolucoes) em vez de
 * reescrever em SQL cru — evita o snapshot de hoje divergir do número "ao
 * vivo" que o técnico vê na tela por causa de uma regra duplicada errado.
 * Idempotente: UPSERT por (users_id, dia), pode rodar de novo no mesmo dia
 * sem duplicar linha.
 */
export async function registrarSnapshotDiario(): Promise<{ tecnicos: number }> {
  await ensureTable();
  const group = process.env.GLPI_VISTOMAP_GROUP ?? "VistoMap-Tecnicos";
  const groupAlt = group === "VistoMap-Tecnicos" ? "VistoMap-Técnicos" : "VistoMap-Tecnicos";
  const tecnicos = await query<{ id: number }>(
    `SELECT DISTINCT u.id
       FROM glpi_users u
       INNER JOIN glpi_groups_users gu ON gu.users_id = u.id
       INNER JOIN glpi_groups g ON g.id = gu.groups_id AND g.name IN (?, ?)
      WHERE u.is_deleted = 0 AND u.is_active = 1`,
    [group, groupAlt]
  );
  const dia = hojeBrasiliaISO();

  for (const t of tecnicos) {
    // vistoriasFila: mesma chamada que fetchVistorias() faz no dashboard
    // (esconde agendadas pro futuro) — fonte de pendentes/concluidas/
    // repetidores. vistoriasTodas: ignora agendamento, mesma fonte que
    // /vistorias/devolucoes/resumo usa pra "revisitas pendentes" de verdade.
    const [vistoriasFila, vistoriasTodas, devolucoesPendentes] = await Promise.all([
      listVistorias({ tecnicoId: t.id }),
      listVistorias({ tecnicoId: t.id, ignorarAgendamento: true }),
      fetchDevolucoes({ tecnicoId: t.id, status: "PENDENTE" }),
    ]);
    const pendentes = vistoriasFila.filter((v) => v.status === "PENDENTE").length;
    const concluidas = vistoriasFila.filter(
      (v) => v.status === "FINALIZADA" || v.status === "APROVADA"
    ).length;
    const repetidores = vistoriasFila.filter(
      (v) => v.status === "PENDENTE" && v.fields?.equipamentofield === "Repetidor"
    ).length;
    const reprovadas = vistoriasTodas.filter(
      (v) =>
        v.status === "REPROVADA" &&
        v.situacaoId !== SITUACAO_EM_VISTORIA &&
        v.situacaoId !== SITUACAO_EM_DESLOCAMENTO
    ).length;

    await execute(
      `INSERT INTO \`${TABLE}\` (users_id, dia, pendentes, concluidas, reprovadas, devolucoes, repetidores)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         pendentes = VALUES(pendentes), concluidas = VALUES(concluidas),
         reprovadas = VALUES(reprovadas), devolucoes = VALUES(devolucoes),
         repetidores = VALUES(repetidores)`,
      [t.id, dia, pendentes, concluidas, reprovadas, devolucoesPendentes.length, repetidores]
    );
  }
  return { tecnicos: tecnicos.length };
}

export interface Trend7d {
  pendentes: number[];
  concluidas: number[];
  reprovadas: number[];
  devolucoes: number[];
  repetidores: number[];
}

/** Últimos 7 dias de snapshot de um técnico — 0-preenchido pros dias sem linha (técnico novo/1ª semana). */
export async function fetchTrend7d(usersId: number): Promise<Trend7d> {
  await ensureTable();
  const rows = await query<{
    dia: string;
    pendentes: number;
    concluidas: number;
    reprovadas: number;
    devolucoes: number;
    repetidores: number;
  }>(
    `SELECT dia, pendentes, concluidas, reprovadas, devolucoes, repetidores
       FROM \`${TABLE}\`
      WHERE users_id = ? AND dia >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      ORDER BY dia ASC`,
    [usersId]
  );
  const porDia = new Map(rows.map((r) => [r.dia, r]));
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  return {
    pendentes: dias.map((d) => porDia.get(d)?.pendentes ?? 0),
    concluidas: dias.map((d) => porDia.get(d)?.concluidas ?? 0),
    reprovadas: dias.map((d) => porDia.get(d)?.reprovadas ?? 0),
    devolucoes: dias.map((d) => porDia.get(d)?.devolucoes ?? 0),
    repetidores: dias.map((d) => porDia.get(d)?.repetidores ?? 0),
  };
}
