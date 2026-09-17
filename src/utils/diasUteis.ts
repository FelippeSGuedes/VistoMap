/**
 * Enumera os próximos N dias úteis (incluindo hoje, se for dia útil).
 * "Útil" aqui é só sáb/dom — não existe calendário de feriados em nenhum
 * outro lugar do código (ver proximoDiaUtil em roteirizacaoHorarios.ts,
 * único precedente, mesma regra). `fimDeSemana` é a mesma flag de
 * configuração de expediente — se a operação já trabalha fim de semana,
 * sábado/domingo contam como dias úteis normalmente.
 */
export function proximosDiasUteis(
  n: number,
  fimDeSemana: boolean,
  from: Date = new Date()
): string[] {
  const dias: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (dias.length < n) {
    const diaSemana = cursor.getDay(); // 0=dom, 6=sáb
    if (fimDeSemana || (diaSemana !== 0 && diaSemana !== 6)) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      dias.push(`${y}-${m}-${d}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}
