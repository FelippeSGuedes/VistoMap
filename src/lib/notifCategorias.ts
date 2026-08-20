/**
 * Taxonomia de notificações do painel — fonte única compartilhada entre o
 * direcionamento do web push (`webpush.ts`/`pushPrefs.ts`), o feed de toast
 * (`api/painel/alertas` + `PainelAlertas.tsx`), a grade de preferências do
 * admin (`configuracoes/page.tsx`) e os selos da fila de notificações
 * (`painel/notificacoes/page.tsx`).
 *
 * Antes desta taxonomia, as mesmas 4 ações viviam hardcoded e duplicadas em
 * 3 arquivos diferentes (achado em auditoria de código, 2026-08-20) — daqui
 * pra frente, qualquer ação nova de notificação só precisa entrar em
 * `ACAO_CATEGORIA`/`ACAO_TITULO`/`ACAO_HREF`.
 *
 * Label/ícone/cor de cada AÇÃO individual (não categoria) continuam vindo
 * de `ACAO_META` em `@/lib/auditMeta` — não duplicar aqui.
 */

import { Ban, ClipboardCheck, ShieldAlert, Undo2, XCircle } from "lucide-react";
import type { AuditEntry } from "@/types";

export const NOTIF_CATEGORIAS = [
  "recusa-solicitada",
  "excecao-solicitada",
  "vistoria-concluida",
  "devolucao-corrigida",
  "reprovacao",
] as const;

export type NotifCategoria = (typeof NOTIF_CATEGORIAS)[number];

export const CATEGORIA_META: Record<
  NotifCategoria,
  { label: string; icon: typeof Ban; fg: string; bg: string }
> = {
  "recusa-solicitada":   { label: "Recusa solicitada",     icon: Ban,            fg: "#B91C1C", bg: "var(--vm-red-tint)" },
  "excecao-solicitada":  { label: "Exceção solicitada",    icon: ShieldAlert,    fg: "#C2410C", bg: "var(--vm-orange-tint)" },
  "vistoria-concluida":  { label: "Vistoria concluída",    icon: ClipboardCheck, fg: "#00875F", bg: "var(--vm-accent-tint)" },
  "devolucao-corrigida": { label: "Devolução corrigida",   icon: Undo2,          fg: "#00875F", bg: "var(--vm-accent-tint)" },
  reprovacao:            { label: "Reprovação",            icon: XCircle,        fg: "#B91C1C", bg: "var(--vm-red-tint)" },
};

/**
 * Ação de auditoria → categoria de notificação. Único ponto que decide
 * quais das ~39 ações do audit log viram notificação — hoje 7 mapeadas.
 */
export const ACAO_CATEGORIA: Partial<Record<AuditEntry["acao"], NotifCategoria>> = {
  "recusa-solicitada":   "recusa-solicitada",
  "override-solicitado": "excecao-solicitada",
  "vistoria-finalizada": "vistoria-concluida",
  "devolucao-resolvida": "devolucao-corrigida",
  "vistoria-reprovada":  "reprovacao",
  "recusa-reprovada":    "reprovacao",
  "override-reprovado":  "reprovacao",
};

/** Título curto do push/toast por ação — texto de EVENTO, não de categoria. */
export const ACAO_TITULO: Partial<Record<AuditEntry["acao"], string>> = {
  "recusa-solicitada":   "Nova recusa",
  "override-solicitado": "Pedido de exceção",
  "vistoria-finalizada": "Vistoria concluída",
  "devolucao-resolvida": "Devolução corrigida",
  "vistoria-reprovada":  "Vistoria reprovada",
  "recusa-reprovada":    "Recusa reprovada",
  "override-reprovado":  "Exceção reprovada",
};

/** URL de destino ao clicar no push/toast, por ação. */
export const ACAO_HREF: Partial<Record<AuditEntry["acao"], string>> = {
  "recusa-solicitada":   "/painel/notificacoes",
  "override-solicitado": "/painel/notificacoes",
  "vistoria-finalizada": "/painel/realizadas",
  "devolucao-resolvida": "/painel/devolucoes",
  "vistoria-reprovada":  "/painel/revisitas",
  "recusa-reprovada":    "/painel/notificacoes",
  "override-reprovado":  "/painel/notificacoes",
};

export function categoriaDeAcao(acao: string): NotifCategoria | null {
  return ACAO_CATEGORIA[acao as AuditEntry["acao"]] ?? null;
}
