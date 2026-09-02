import { Camera, Lock, MapPin, Bell, Smartphone, ShieldCheck, Mail } from "lucide-react";
import { asset } from "@/utils/asset";

const ATUALIZADO_EM = "setembro de 2026";

const SECOES = [
  { id: "dados", numero: "01", titulo: "Quais dados coletamos" },
  { id: "nao-coletamos", numero: "02", titulo: "O que não coletamos" },
  { id: "finalidade", numero: "03", titulo: "Finalidade e base legal" },
  { id: "terceiros", numero: "04", titulo: "Compartilhamento" },
  { id: "seguranca", numero: "05", titulo: "Segurança" },
  { id: "retencao", numero: "06", titulo: "Retenção e eliminação" },
  { id: "direitos", numero: "07", titulo: "Seus direitos" },
  { id: "alteracoes", numero: "08", titulo: "Alterações" },
  { id: "contato", numero: "09", titulo: "Contato" },
] as const;

const DADOS_COLETADOS = [
  {
    icon: Smartphone,
    titulo: "Dados de conta",
    texto:
      "Nome, e-mail e matrícula, vinculados à sua conta corporativa (autenticação integrada ao sistema GLPI da empresa).",
  },
  {
    icon: MapPin,
    titulo: "Localização (GPS)",
    texto:
      "Coletada em segundo plano durante o período de expediente, para coordenação operacional e controle de jornada. Regida por um termo de consentimento específico, exibido no próprio aplicativo antes de qualquer rastreio, com retenção limitada a 12 meses.",
  },
  {
    icon: Camera,
    titulo: "Fotos e vídeos",
    texto:
      "Capturados pela câmera do aparelho durante a execução das vistorias, anexados aos registros técnicos correspondentes.",
  },
  {
    icon: ShieldCheck,
    titulo: "Dados técnicos da vistoria",
    texto: "Informações preenchidas pelo técnico sobre os equipamentos e postes vistoriados.",
  },
  {
    icon: Bell,
    titulo: "Token de notificação",
    texto:
      "Identificador do aparelho usado para envio de notificações push (novas vistorias atribuídas, prazos), via Firebase Cloud Messaging (Google).",
  },
  {
    icon: Smartphone,
    titulo: "Dados básicos do aparelho",
    texto:
      "Versão do aplicativo instalada, usada apenas para garantir compatibilidade e segurança — nunca para rastreamento publicitário.",
  },
] as const;

export function PoliticaPrivacidadeContent() {
  return (
    <div className="bg-white text-[#111827]">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div
        className="px-5 py-14 text-center sm:px-8"
        style={{
          background: "linear-gradient(180deg, #073B4C 0%, #052A36 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset("/nansen.png")} alt="Nansen" className="mx-auto h-7 w-auto opacity-90" />
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.22em] text-[#4DFF88]">
          VistoMap · Nansen
        </p>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-tight text-white sm:text-[36px]">
          Política de Privacidade
        </h1>
        <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-relaxed text-white/65">
          Como tratamos os dados pessoais de quem usa o aplicativo VistoMap, em
          conformidade com a LGPD (Lei nº 13.709/2018).
        </p>
        <span className="mt-5 inline-block rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[11.5px] font-medium text-white/70">
          Última atualização: {ATUALIZADO_EM}
        </span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 py-12 sm:px-8">
        {/* ── Navegação rápida ───────────────────────────────── */}
        <nav
          aria-label="Seções desta política"
          className="mb-12 flex flex-wrap gap-2"
        >
          {SECOES.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-1.5 text-[12px] font-semibold text-[#073B4C] transition hover:border-[#06D6A0]/50 hover:bg-[#06D6A0]/10"
            >
              {s.numero} · {s.titulo}
            </a>
          ))}
        </nav>

        <p className="mb-14 text-[15px] leading-[1.75] text-[#374151]">
          Esta Política de Privacidade descreve como a <strong>Nansen</strong> coleta,
          usa, armazena e protege os dados pessoais tratados através do aplicativo{" "}
          <strong>VistoMap</strong>, utilizado por técnicos de campo para execução de
          vistorias técnicas, em conformidade com a Lei nº 13.709/2018 (Lei Geral de
          Proteção de Dados Pessoais — LGPD).
        </p>

        {/* ── 01 · Dados coletados ───────────────────────────── */}
        <Secao id="dados" numero="01" titulo="Quais dados coletamos">
          <div className="grid gap-3 sm:grid-cols-2">
            {DADOS_COLETADOS.map((d) => (
              <div
                key={d.titulo}
                className="rounded-2xl border border-[#E5E7EB] bg-[#F8F9FA] p-4"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#073B4C]/8 text-[#073B4C]">
                  <d.icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <p className="mt-2.5 text-[13.5px] font-bold text-[#073B4C]">{d.titulo}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[#5B6472]">{d.texto}</p>
              </div>
            ))}
          </div>
        </Secao>

        {/* ── 02 · O que NÃO coletamos (destaque) ────────────── */}
        <Secao id="nao-coletamos" numero="02" titulo="O que NÃO coletamos">
          <div className="flex gap-3.5 rounded-2xl border border-[#06D6A0]/30 bg-[#06D6A0]/[0.06] p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#06D6A0]/15 text-[#049268]">
              <Lock className="h-5 w-5" strokeWidth={2} />
            </span>
            <p className="text-[13.5px] leading-relaxed text-[#0B4A38]">
              A verificação de identidade por biometria (digital ou reconhecimento
              facial), usada na trava diária de segurança do aplicativo, é processada{" "}
              <strong>inteiramente pelo sistema operacional do aparelho</strong>. Seus
              dados biométricos nunca são enviados, recebidos ou armazenados pelos
              servidores do VistoMap — o aplicativo apenas recebe uma confirmação de
              sucesso ou falha do próprio Android, sem acesso à digital ou ao rosto do
              titular.
            </p>
          </div>
        </Secao>

        {/* ── 03 · Finalidade ─────────────────────────────────── */}
        <Secao id="finalidade" numero="03" titulo="Finalidade e base legal">
          <p>
            Os dados são tratados exclusivamente para fins de coordenação operacional,
            controle de jornada de trabalho e auditoria interna, com fundamento no art.
            7º, inciso V, da LGPD (execução de contrato de trabalho ou de procedimentos
            preliminares a ele relacionados) e, quando aplicável, mediante consentimento
            específico do titular — como ocorre com a coleta de geolocalização.
          </p>
        </Secao>

        {/* ── 04 · Terceiros ──────────────────────────────────── */}
        <Secao id="terceiros" numero="04" titulo="Compartilhamento com terceiros">
          <p className="mb-3">
            Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins
            comerciais. Utilizamos os seguintes operadores, estritamente para
            viabilizar funcionalidades do aplicativo:
          </p>
          <ul className="space-y-1.5">
            <li className="flex gap-2">
              <span className="text-[#06D6A0]">—</span>
              <span><strong>Google Firebase</strong> — envio de notificações push.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#06D6A0]">—</span>
              <span><strong>Mapbox / Google Maps</strong> — exibição de mapas e geolocalização em tela.</span>
            </li>
          </ul>
        </Secao>

        {/* ── 05 · Segurança ──────────────────────────────────── */}
        <Secao id="seguranca" numero="05" titulo="Segurança dos dados">
          <ul className="space-y-1.5">
            {[
              "Comunicação entre o aplicativo e o servidor via HTTPS.",
              "Sessões autenticadas por token com expiração, revogadas no logout.",
              "Trava diária de segurança local (senha ou biometria) que exige nova confirmação a cada dia, mesmo com sessão ativa — o hash da senha usado nessa verificação é derivado e armazenado apenas no próprio aparelho, nunca transmitido.",
              "Acesso aos dados no backend restrito por perfil de usuário (técnico, moderador, administrador).",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-[#06D6A0]">—</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Secao>

        {/* ── 06 · Retenção ───────────────────────────────────── */}
        <Secao id="retencao" numero="06" titulo="Retenção e eliminação">
          <p>
            Dados de geolocalização são retidos por até 12 (doze) meses, findo o qual
            são eliminados ou anonimizados. Demais dados operacionais (registros de
            vistoria) são retidos pelo prazo necessário ao cumprimento de obrigações
            legais e contratuais da empresa.
          </p>
        </Secao>

        {/* ── 07 · Direitos ───────────────────────────────────── */}
        <Secao id="direitos" numero="07" titulo="Seus direitos">
          <p className="mb-3">
            Nos termos do art. 18 da LGPD, você pode solicitar a qualquer momento:
          </p>
          <ul className="space-y-1.5">
            {[
              "Confirmação da existência de tratamento de dados;",
              "Acesso, correção ou atualização dos seus dados;",
              "Anonimização, bloqueio ou eliminação de dados desnecessários;",
              "Revogação do consentimento (quando aplicável);",
              "Informação sobre com quem seus dados foram compartilhados.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-[#06D6A0]">—</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            A revogação do consentimento de geolocalização impede o início de novas
            vistorias pelo aplicativo, mas não afeta o tratamento realizado
            anteriormente à revogação.
          </p>
        </Secao>

        {/* ── 08 · Alterações ─────────────────────────────────── */}
        <Secao id="alteracoes" numero="08" titulo="Alterações desta política">
          <p>
            Esta política pode ser atualizada periodicamente. A data da última
            atualização é sempre indicada no topo desta página.
          </p>
        </Secao>

        {/* ── 09 · Contato (CTA) ──────────────────────────────── */}
        <Secao id="contato" numero="09" titulo="Contato" ultima>
          <p className="mb-4">
            Dúvidas, solicitações ou exercício dos direitos acima podem ser
            encaminhados diretamente para nosso canal de atendimento.
          </p>
          <a
            href="mailto:contato.vistomap@nansen.com.br"
            className="inline-flex items-center gap-2.5 rounded-2xl bg-[#073B4C] px-5 py-3 text-[14px] font-bold text-white shadow-[0_10px_28px_rgba(7,59,76,0.22)] transition hover:brightness-110"
          >
            <Mail className="h-[17px] w-[17px]" strokeWidth={2} />
            contato.vistomap@nansen.com.br
          </a>
        </Secao>

        <footer className="mt-16 border-t border-[#E5E7EB] pt-6 text-center text-[11px] text-[#9CA3AF]">
          VistoMap · Nansen · Todos os direitos reservados © 2026
        </footer>
      </div>
    </div>
  );
}

function Secao({
  id,
  numero,
  titulo,
  children,
  ultima,
}: {
  id: string;
  numero: string;
  titulo: string;
  children: React.ReactNode;
  ultima?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-6 ${ultima ? "" : "mb-11 border-b border-[#F1F2F4] pb-11"}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#073B4C] text-[11px] font-bold text-white">
          {numero}
        </span>
        <h2 className="text-[18px] font-bold tracking-tight text-[#073B4C]">{titulo}</h2>
      </div>
      <div className="pl-10 text-[14px] leading-[1.75] text-[#374151]">{children}</div>
    </section>
  );
}
