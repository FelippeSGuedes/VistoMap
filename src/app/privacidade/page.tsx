import type { Metadata } from "next";
import { asset } from "@/utils/asset";

export const metadata: Metadata = {
  title: "Política de Privacidade",
};

const ATUALIZADO_EM = "setembro de 2026";

export default function PoliticaPrivacidadePage() {
  return (
    <main className="min-h-[100dvh] bg-brand-ice text-ink">
      <div className="mx-auto max-w-[720px] px-5 py-12 sm:px-8">
        <header className="mb-10 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset("/nansen.png")} alt="Nansen" className="h-8 w-auto opacity-90" />
          <h1 className="mt-6 text-[26px] font-bold tracking-tight text-brand-deep">
            Política de Privacidade
          </h1>
          <p className="mt-1.5 text-[13px] font-medium text-ink-muted">
            VistoMap — Plataforma de vistorias técnicas em campo
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            Última atualização: {ATUALIZADO_EM}
          </p>
        </header>

        <article className="space-y-9 text-[14.5px] leading-relaxed text-ink">
          <section>
            <p>
              Esta Política de Privacidade descreve como a <strong>Nansen</strong>{" "}
              coleta, usa, armazena e protege os dados pessoais tratados através
              do aplicativo <strong>VistoMap</strong>, utilizado por técnicos de
              campo para execução de vistorias técnicas, em conformidade com a
              Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais —
              LGPD).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              1. Quais dados coletamos
            </h2>
            <ul className="list-disc space-y-2.5 pl-5">
              <li>
                <strong>Dados de conta:</strong> nome, e-mail e matrícula,
                vinculados à sua conta corporativa (autenticação integrada ao
                sistema GLPI da empresa).
              </li>
              <li>
                <strong>Localização (GPS):</strong> coletada em segundo plano
                durante o período de expediente, para coordenação operacional
                e controle de jornada. A coleta é regida por um termo de
                consentimento específico, exibido no próprio aplicativo antes
                de qualquer rastreio, com retenção limitada a 12 (doze) meses.
              </li>
              <li>
                <strong>Fotos e vídeos:</strong> capturados pela câmera do
                aparelho durante a execução das vistorias, anexados aos
                registros técnicos correspondentes.
              </li>
              <li>
                <strong>Dados técnicos da vistoria:</strong> informações
                preenchidas pelo técnico sobre os equipamentos e postes
                vistoriados.
              </li>
              <li>
                <strong>Token de notificação:</strong> identificador do
                aparelho usado para envio de notificações push (novas
                vistorias atribuídas, prazos), via Firebase Cloud Messaging
                (Google).
              </li>
              <li>
                <strong>Dados básicos do aparelho:</strong> versão do
                aplicativo instalada, usada apenas para garantir
                compatibilidade e segurança (nunca para rastreamento
                publicitário).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              2. O que NÃO coletamos
            </h2>
            <p>
              A verificação de identidade por biometria (digital ou
              reconhecimento facial), usada na trava diária de segurança do
              aplicativo, é processada <strong>inteiramente pelo sistema
              operacional do aparelho</strong>. Seus dados biométricos nunca
              são enviados, recebidos ou armazenados pelos servidores do
              VistoMap — o aplicativo apenas recebe uma confirmação de
              sucesso ou falha do próprio Android, sem acesso à digital ou ao
              rosto do titular.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              3. Finalidade e base legal
            </h2>
            <p>
              Os dados são tratados exclusivamente para fins de coordenação
              operacional, controle de jornada de trabalho e auditoria
              interna, com fundamento no art. 7º, inciso V, da LGPD (execução
              de contrato de trabalho ou de procedimentos preliminares a ele
              relacionados) e, quando aplicável, mediante consentimento
              específico do titular — como ocorre com a coleta de
              geolocalização.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              4. Compartilhamento com terceiros
            </h2>
            <p className="mb-2.5">
              Não vendemos nem compartilhamos seus dados pessoais com
              terceiros para fins comerciais. Utilizamos os seguintes
              operadores, estritamente para viabilizar funcionalidades do
              aplicativo:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Google Firebase</strong> — envio de notificações push.
              </li>
              <li>
                <strong>Mapbox / Google Maps</strong> — exibição de mapas e
                geolocalização em tela.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              5. Segurança dos dados
            </h2>
            <ul className="list-disc space-y-2.5 pl-5">
              <li>Comunicação entre o aplicativo e o servidor via HTTPS.</li>
              <li>
                Sessões autenticadas por token com expiração, revogadas no
                logout.
              </li>
              <li>
                Trava diária de segurança local (senha ou biometria) que
                exige nova confirmação a cada dia, mesmo com sessão ativa —
                o hash da senha usado nessa verificação é derivado e
                armazenado apenas no próprio aparelho, nunca transmitido.
              </li>
              <li>
                Acesso aos dados no backend restrito por perfil de usuário
                (técnico, moderador, administrador).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              6. Retenção e eliminação
            </h2>
            <p>
              Dados de geolocalização são retidos por até 12 (doze) meses,
              findo o qual são eliminados ou anonimizados. Demais dados
              operacionais (registros de vistoria) são retidos pelo prazo
              necessário ao cumprimento de obrigações legais e contratuais da
              empresa.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              7. Seus direitos
            </h2>
            <p className="mb-2.5">
              Nos termos do art. 18 da LGPD, você pode solicitar a qualquer
              momento:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Confirmação da existência de tratamento de dados;</li>
              <li>Acesso, correção ou atualização dos seus dados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
              <li>Revogação do consentimento (quando aplicável);</li>
              <li>Informação sobre com quem seus dados foram compartilhados.</li>
            </ul>
            <p className="mt-2.5">
              A revogação do consentimento de geolocalização impede o início
              de novas vistorias pelo aplicativo, mas não afeta o tratamento
              realizado anteriormente à revogação.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              8. Alterações desta política
            </h2>
            <p>
              Esta política pode ser atualizada periodicamente. A data da
              última atualização é sempre indicada no topo desta página.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-bold text-brand-deep">
              9. Contato
            </h2>
            <p>
              Dúvidas, solicitações ou exercício dos direitos acima podem ser
              enviados para{" "}
              <a
                href="mailto:comunicacao.ami@nansen.com.br"
                className="font-semibold text-brand-emerald underline underline-offset-2"
              >
                comunicacao.ami@nansen.com.br
              </a>
              .
            </p>
          </section>
        </article>

        <footer className="mt-14 border-t border-brand-steel pt-6 text-center text-[11px] text-ink-muted">
          VistoMap · Nansen · Todos os direitos reservados © 2026
        </footer>
      </div>
    </main>
  );
}
