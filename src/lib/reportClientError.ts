import { api } from "@/services/api";

/**
 * Reporta um erro do CLIENTE pro backend (POST /api/errors → logError()).
 * Fire-and-forget, nunca lança — reportar um erro não pode gerar outro erro.
 */
export function reportClientError(
  mensagem: string,
  rota: string,
  contexto?: Record<string, unknown>
): void {
  try {
    void api.post("/errors", { mensagem, rota, contexto }).catch(() => {});
  } catch {
    // ignora — ver comentário acima
  }
}
