/**
 * Metadados visuais por tipo de ação de auditoria (label/ícone/cores) —
 * compartilhado entre /painel/auditoria e /painel/tecnicos/[id] pra não
 * duplicar a mesma tabela de ~20 ações em dois arquivos.
 */

import {
  Activity,
  Ban,
  ClipboardCheck,
  Edit3,
  FileText,
  LogIn,
  RefreshCcw,
  RotateCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Wrench,
  XCircle,
} from "lucide-react";
import type { AuditEntry } from "@/types";

export const ACAO_META: Record<
  AuditEntry["acao"],
  { label: string; icon: typeof Activity; fg: string; bg: string; dot: string }
> = {
  "vistoria-atribuida":  { label: "Atribuição",           icon: Send,         fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "vistoria-desvinculada":{ label: "Desvinculação",       icon: XCircle,      fg: "#B45309", bg: "var(--vm-orange-tint)", dot: "#F97316" },
  "vistoria-finalizada": { label: "Vistoria finalizada",  icon: ClipboardCheck,fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "revisita-criada":     { label: "Revisita criada",      icon: RotateCw,     fg: "#B45309", bg: "#FFFBEB", dot: "#F59E0B" },
  "revisita-atribuida":  { label: "Revisita atribuída",   icon: Send,         fg: "#C2410C", bg: "var(--vm-orange-tint)", dot: "#F97316" },
  "revisita-finalizada": { label: "Revisita concluída",   icon: ClipboardCheck,fg: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "vistoria-aprovada":   { label: "Aprovada",             icon: ShieldCheck,  fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "vistoria-reprovada":  { label: "Reprovada",            icon: XCircle,      fg: "#B91C1C", bg: "var(--vm-red-tint)", dot: "#EF4444" },
  "pdf-regenerado":      { label: "PDF regenerado",       icon: FileText,     fg: "#4338CA", bg: "var(--vm-indigo-tint)", dot: "#6366F1" },
  "motivo-alterado":     { label: "Motivo alterado",      icon: Edit3,        fg: "#854D0E", bg: "#FEFCE8", dot: "#CA8A04" },
  "dados-editados":      { label: "Dados editados",       icon: Edit3,        fg: "#475569", bg: "var(--vm-tile)", dot: "#94A3B8" },
  sincronizacao:         { label: "Sincronização",        icon: RefreshCcw,   fg: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "login-admin":         { label: "Login admin",          icon: LogIn,        fg: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "login-tecnico":       { label: "Login técnico",        icon: LogIn,        fg: "#475569", bg: "var(--vm-tile)", dot: "#94A3B8" },
  "expediente-iniciado": { label: "Expediente iniciado",  icon: LogIn,        fg: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "expediente-finalizado":{ label: "Expediente encerrado",icon: LogIn,        fg: "#475569", bg: "var(--vm-tile)", dot: "#94A3B8" },
  "vistoria-iniciada":       { label: "Vistoria iniciada",      icon: Activity,     fg: "#0F766E", bg: "#F0FDFA", dot: "#14B8A6" },
  "vistoria-em-deslocamento":{ label: "Em Deslocamento",          icon: Activity,     fg: "#D97706", bg: "#FFFBEB", dot: "#F59E0B" },
  "vistoria-em-vistoria":    { label: "Em Vistoria (campo)",      icon: Activity,     fg: "#2563EB", bg: "#EFF6FF", dot: "#3B82F6" },
  "override-solicitado":     { label: "Início fora do raio",      icon: ShieldAlert,  fg: "#C2410C", bg: "var(--vm-orange-tint)", dot: "#F97316" },
  "override-aprovado":       { label: "Override aprovado",        icon: ShieldCheck,  fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "override-reprovado":      { label: "Override reprovado",       icon: XCircle,      fg: "#B91C1C", bg: "var(--vm-red-tint)", dot: "#EF4444" },
  "vistoria-devolvida":      { label: "Devolvida para correção",  icon: Undo2,        fg: "#B91C1C", bg: "var(--vm-red-tint)", dot: "#DC2626" },
  "devolucao-resolvida":     { label: "Devolução resolvida",      icon: ClipboardCheck,fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "recusa-solicitada":       { label: "Recusa solicitada",        icon: Ban,          fg: "#B91C1C", bg: "var(--vm-red-tint)", dot: "#DC2626" },
  "recusa-aprovada":         { label: "Recusa aprovada",          icon: ShieldCheck,  fg: "#B91C1C", bg: "var(--vm-red-tint)", dot: "#DC2626" },
  "recusa-reprovada":        { label: "Recusa reprovada",         icon: XCircle,      fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "instalacao-assumida":     { label: "Instalação assumida",      icon: Wrench,       fg: "#2563EB", bg: "#EFF6FF", dot: "#3B82F6" },
  "instalacao-finalizada":   { label: "Instalação finalizada",    icon: ClipboardCheck,fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "instalacao-rejeitada":    { label: "Instalação rejeitada",     icon: Ban,          fg: "#B91C1C", bg: "var(--vm-red-tint)", dot: "#DC2626" },
  "instalacao-aprovada":     { label: "Instalação aprovada (CPFL)",icon: ShieldCheck, fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
  "instalacao-reprovada":    { label: "Instalação reprovada (CPFL)",icon: XCircle,    fg: "#B91C1C", bg: "var(--vm-red-tint)", dot: "#EF4444" },
  "instalacao-rejeicao-escalada":   { label: "Rejeição escalada p/ vistoria", icon: Undo2, fg: "#B45309", bg: "var(--vm-orange-tint)", dot: "#F97316" },
  "instalacao-rejeicao-descartada": { label: "Rejeição descartada",          icon: RotateCw, fg: "#00875F", bg: "var(--vm-accent-tint)", dot: "#00B388" },
};

export function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}
