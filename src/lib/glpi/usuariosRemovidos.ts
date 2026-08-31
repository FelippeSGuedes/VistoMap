/**
 * Nome de usuário que não existe mais em `glpi_users`.
 *
 * Quando alguém sai da empresa e o usuário é PURGADO do GLPI (apagado de vez,
 * não exclusão lógica), toda vistoria que ele fez continua apontando para um
 * id que não resolve mais. O join devolve nulo e a tela mostraria algo como
 * "Usuário #11" — feio e, pior, dá a entender que a vistoria não teve técnico,
 * que é coisa diferente.
 *
 * O GLPI, porém, guarda o nome no próprio histórico: quando o usuário foi
 * criado e ganhou perfil/grupo, `glpi_logs` registrou "Nome Completo (id)".
 * Daí dá pra recuperar o nome real sem chumbar nada no código — e continua
 * funcionando pro próximo que sair, sem precisar de deploy.
 *
 * Caso real que originou isso (2026-08-31): José Renato Alves Dutra, id 11,
 * 177 vistorias. Era o único órfão da base.
 *
 * Limite conhecido: se o histórico do GLPI for expurgado, o nome se perde e
 * sobra o rótulo neutro. A prova contra isso seria gravar o nome do técnico
 * junto da vistoria no momento em que ela é finalizada, para não depender de
 * o cadastro sobreviver — vale se isso voltar a incomodar.
 */

import { query } from "@/lib/db";

/**
 * Cache por processo. A busca varre `glpi_logs` com LIKE (110k linhas, ~20ms
 * medidos), o que é barato uma vez e desperdício a cada request. Guarda também
 * o resultado negativo, senão id sem histórico refaz a varredura sempre.
 */
const cache = new Map<number, string | null>();

/**
 * "José Renato Alves Dutra (11), Técnico Nansen (12)" + id 11 → o nome.
 *
 * Lê SÓ o primeiro elemento, de propósito. Nesses registros o GLPI grava o
 * usuário primeiro e o alvo do vínculo (entidade/perfil/grupo) depois, e o
 * alvo tem numeração própria — em "Ronaldo Inacio (8), Coordenação (11)" o
 * 11 é a entidade Coordenação, não o usuário. Aceitar qualquer elemento com
 * o id casando devolvia justamente esse nome errado (visto no teste contra a
 * base real antes de subir).
 */
function extrairNome(valor: string | null, id: number): string | null {
  if (!valor) return null;
  const primeiro = valor.split(",")[0]?.trim();
  if (!primeiro) return null;
  const m = primeiro.match(/^(.+?)\s*\((\d+)\)$/);
  if (!m || Number(m[2]) !== id) return null;
  const nome = m[1].trim();
  return nome === "" ? null : nome;
}

async function buscarNoHistorico(id: number): Promise<string | null> {
  const alvo = `%(${id})%`;
  // itemtype_link = 'User' isola os registros que descrevem vínculo de
  // USUÁRIO. Sem isso, qualquer log que termine em "(11)" — regra, porta de
  // rede, o que for — casava e devolvia lixo como se fosse nome de gente.
  const rows = await query<{ v: string | null }>(
    `(SELECT new_value AS v FROM glpi_logs
       WHERE itemtype_link = 'User' AND new_value LIKE ? LIMIT 20)
     UNION ALL
     (SELECT old_value AS v FROM glpi_logs
       WHERE itemtype_link = 'User' AND old_value LIKE ? LIMIT 20)`,
    [alvo, alvo]
  );
  for (const r of rows) {
    const nome = extrairNome(r.v, id);
    if (nome) return nome;
  }
  return null;
}

/**
 * Resolve os nomes dos ids informados. Ids que não renderem nome simplesmente
 * não entram no Map — quem chama decide o rótulo neutro, para a decisão de
 * texto ficar na camada que exibe.
 */
export async function nomesDeUsuariosRemovidos(
  ids: number[]
): Promise<Map<number, string>> {
  const encontrados = new Map<number, string>();
  const unicos = [...new Set(ids)].filter((id) => Number.isFinite(id) && id > 0);

  for (const id of unicos) {
    if (!cache.has(id)) {
      try {
        cache.set(id, await buscarNoHistorico(id));
      } catch {
        // Falha aqui não pode derrubar a listagem: sem nome, cai no rótulo
        // neutro. Não guarda no cache pra poder tentar de novo depois.
        continue;
      }
    }
    const nome = cache.get(id);
    if (nome) encontrados.set(id, nome);
  }

  return encontrados;
}
