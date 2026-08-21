import { redirect } from "next/navigation";

/**
 * /painel/configuracoes virou um grupo de menu (ver CONFIG_GROUP em
 * client-layout.tsx) com página dedicada por seção — Expediente,
 * Notificações, Colaboradores, Novo Colaborador. Essa raiz só existe pra
 * não quebrar links antigos; redireciona pra a primeira seção.
 */
export default function ConfiguracoesRedirect() {
  redirect("/painel/configuracoes/expediente");
}
