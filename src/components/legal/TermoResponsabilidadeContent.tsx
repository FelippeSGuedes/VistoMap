const VERSAO_TERMO = "v1";

/**
 * Texto do termo de uso do fluxo /liberar-acesso — RASCUNHO. Cobre os
 * pontos pedidos (uso exclusivo a trabalho, proibição de repasse,
 * aparelho corporativo, vínculo do aparelho, LGPD), mas é texto escrito
 * por mim, não pelo jurídico da empresa — revisar/ajustar a redação final
 * antes de publicar em produção.
 */
export const TERMO_VERSAO = VERSAO_TERMO;

const SECOES = [
  {
    titulo: "1. Uso exclusivo para atividade profissional",
    texto:
      "O aplicativo VistoMap e o acesso concedido por este termo destinam-se exclusivamente à execução das suas atividades como técnico de campo da Nansen. É vedado o uso do aplicativo para qualquer finalidade pessoal ou alheia às suas funções.",
  },
  {
    titulo: "2. Proibição de repasse",
    texto:
      "Você não pode repassar, emprestar ou compartilhar o aplicativo instalado, seu login e senha, ou o aparelho vinculado, com qualquer outra pessoa — inclusive outros técnicos, familiares ou terceiros. O acesso é pessoal e intransferível.",
  },
  {
    titulo: "3. Instalação em aparelho corporativo",
    texto:
      "O aplicativo deve ser instalado e utilizado somente no aparelho celular fornecido pela empresa para o exercício da função, ou em aparelho previamente autorizado pela Nansen para esse fim.",
  },
  {
    titulo: "4. Vínculo com este aparelho",
    texto:
      "Ao aceitar este termo, o aplicativo passa a funcionar exclusivamente neste aparelho — a mesma conta não poderá ser usada em nenhum outro celular. Se você trocar de aparelho corporativo, um administrador precisa liberar o novo aparelho antes que você consiga acessar o aplicativo nele.",
  },
  {
    titulo: "5. Tratamento de dados (LGPD)",
    texto:
      "Para esta ativação, coletamos e conferimos seu nome, e-mail corporativo e matrícula (já existentes no cadastro da empresa) e um identificador técnico do seu aparelho, exclusivamente para viabilizar o vínculo descrito acima e a segurança do acesso, em conformidade com a Lei nº 13.709/2018 (LGPD). Esses dados não são usados para nenhuma outra finalidade. Consulte a Política de Privacidade completa do VistoMap para mais detalhes sobre o tratamento de dados do aplicativo.",
  },
  {
    titulo: "6. Descumprimento",
    texto:
      "O descumprimento deste termo — incluindo o repasse do acesso a terceiros ou o uso fora da finalidade profissional — pode resultar na revogação imediata do acesso ao aplicativo e sujeitar o responsável às medidas cabíveis previstas nas políticas internas da empresa.",
  },
] as const;

export function TermoResponsabilidadeContent() {
  return (
    <div className="space-y-5 text-[13px] leading-relaxed text-ink">
      <p className="text-ink-muted">
        Leia com atenção antes de continuar — a rolagem até o fim é obrigatória
        para liberar o botão de aceite.
      </p>
      {SECOES.map((s) => (
        <div key={s.titulo}>
          <p className="text-[13px] font-semibold text-ink">{s.titulo}</p>
          <p className="mt-1 text-ink-muted">{s.texto}</p>
        </div>
      ))}
      <p className="border-t border-brand-steel/40 pt-4 text-[11px] text-ink-muted">
        Termo {VERSAO_TERMO} · Nansen · VistoMap
      </p>
    </div>
  );
}
