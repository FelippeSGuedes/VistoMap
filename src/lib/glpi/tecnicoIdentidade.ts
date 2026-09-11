import "server-only";
import { execute, query } from "@/lib/db";

/**
 * Cor de identidade por técnico/instalador — "Sinal" do mapa (2026-09-11).
 *
 * Cada usuário de campo ganha UMA cor fixa, usada no anel externo dos
 * marcadores de vistoria, no pin 2D e no uniforme do boneco 3D. É a
 * resposta a "quem está nessa região?" sem precisar clicar em nada.
 *
 * Regras:
 *  - Paleta curada, neutra e de saturação baixa de propósito: as cores de
 *    STATUS (laranja/azul/verde/vermelho/cinza) são vivas e ficam no miolo
 *    do marcador — a identidade nunca pode competir com elas.
 *  - Atribuição automática na primeira vez que o usuário aparece no mapa:
 *    pega a cor menos usada (empate → ordem da paleta). Depois disso a cor
 *    fica presa ao users_id — nunca muda sozinha entre carregamentos.
 *  - O admin pode trocar manualmente (Configurações › Colaboradores);
 *    `manual=1` só registra que foi escolha humana.
 */

const TABLE = "glpi_plugin_vistomap_tecnico_identidade";

export const PALETA_IDENTIDADE = [
  { nome: "Ardósia",    hex: "#4F6D8F" },
  { nome: "Terracota",  hex: "#B5634A" },
  { nome: "Oliva",      hex: "#7A8B3C" },
  { nome: "Ameixa",     hex: "#7E4E8C" },
  { nome: "Petróleo",   hex: "#2E7E85" },
  { nome: "Ocre",       hex: "#B58A2E" },
  { nome: "Índigo",     hex: "#4B55A8" },
  { nome: "Cobre-rosa", hex: "#9C5A63" },
  { nome: "Bronze",     hex: "#8C6A3F" },
  { nome: "Vinho",      hex: "#8A3A4E" },
  { nome: "Lavanda",    hex: "#7B7FA8" },
  { nome: "Café",       hex: "#6B4F3A" },
] as const;

export type CorIdentidade = (typeof PALETA_IDENTIDADE)[number]["hex"];

export function corIdentidadeValida(hex: string): hex is CorIdentidade {
  return PALETA_IDENTIDADE.some((c) => c.hex.toUpperCase() === hex.toUpperCase());
}

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
      users_id   INT        NOT NULL,
      cor_hex    CHAR(7)    NOT NULL,
      manual     TINYINT(1) NOT NULL DEFAULT 0,
      created_at timestamp  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (users_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

/**
 * Cor de cada usuário informado. Quem ainda não tem ganha uma agora
 * (persistida), então o retorno sempre cobre todos os ids pedidos.
 */
export async function getCoresIdentidade(usersIds: number[]): Promise<Map<number, string>> {
  await ensureTable();
  const ids = [...new Set(usersIds.filter((id) => Number.isFinite(id) && id > 0))];
  const out = new Map<number, string>();
  if (ids.length === 0) return out;

  // Uso GLOBAL da paleta (não só dos ids pedidos): a cor menos usada é
  // decidida olhando todo mundo, senão dois grupos diferentes (técnicos e
  // instaladores) receberiam as mesmas primeiras cores.
  const todas = await query<{ users_id: number; cor_hex: string }>(
    `SELECT users_id, cor_hex FROM \`${TABLE}\``
  );
  const uso = new Map<string, number>(PALETA_IDENTIDADE.map((c) => [c.hex, 0]));
  for (const r of todas) {
    const hex = r.cor_hex.toUpperCase();
    uso.set(hex, (uso.get(hex) ?? 0) + 1);
    if (ids.includes(r.users_id)) out.set(r.users_id, hex);
  }

  const faltando = ids.filter((id) => !out.has(id)).sort((a, b) => a - b);
  for (const id of faltando) {
    let escolhida = PALETA_IDENTIDADE[0].hex as string;
    let menor = Infinity;
    for (const c of PALETA_IDENTIDADE) {
      const n = uso.get(c.hex) ?? 0;
      if (n < menor) { menor = n; escolhida = c.hex; }
    }
    uso.set(escolhida, menor + 1);
    out.set(id, escolhida);
    // INSERT IGNORE: dois polls simultâneos podem tentar criar o mesmo
    // usuário — o primeiro vence e o segundo lê a cor dele no próximo ciclo.
    await execute(
      `INSERT IGNORE INTO \`${TABLE}\` (users_id, cor_hex, manual) VALUES (?, ?, 0)`,
      [id, escolhida]
    );
  }
  return out;
}

export async function setCorIdentidade(usersId: number, hex: CorIdentidade): Promise<void> {
  await ensureTable();
  await execute(
    `INSERT INTO \`${TABLE}\` (users_id, cor_hex, manual) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE cor_hex = VALUES(cor_hex), manual = 1`,
    [usersId, hex.toUpperCase()]
  );
}
