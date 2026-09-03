import { api } from "./api";
import type { HistoricoSummary } from "@/types";

export async function fetchHistoricoResumo(
  periodo: "7d" | "30d" | "90d" | "all"
): Promise<HistoricoSummary> {
  const { data } = await api.get<HistoricoSummary>("/historico", {
    params: { periodo },
  });
  return data;
}
