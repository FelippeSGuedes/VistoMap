"use client";

/**
 * AssistenteVistoria — balão flutuante único de ajuda + conversa guiada,
 * substituindo AjudaTriagemSheet (árvore estática) e os pontos de entrada
 * espalhados (link de texto em GuidedArrival, pílula em VistoriaExecucaoForm
 * e vistoria-corrigir). Só aparece durante a EXECUÇÃO de fato da vistoria
 * (preenchendo o formulário) — não em GuidedArrival, que é só navegação
 * até o poste, antes de existir o que ajudar (2026-09-10).
 *
 * Design: parece uma conversa com um atendente, não um formulário. O
 * técnico só vê a pergunta ATUAL — as trocas já respondidas ficam acima
 * como histórico de chat (mensagens do bot à esquerda, respostas dele à
 * direita), nunca a árvore inteira de uma vez. Cada resposta gera uma
 * reaçãozinha curta do assistente antes da próxima pergunta.
 *
 * Por baixo, ZERO regra de negócio nova: toda "decisão" no fim de um ramo
 * (Registrar impedimento / Recusar vistoria) entrega motivo+respostas+foto
 * pro MESMO RecusarVistoriaFlow de sempre — motivo obrigatório, aprovação
 * do analista, tudo igual. "Impedimento" e "Recusa" são só duas categorias
 * (cor/rótulo) derivadas do motivo em recusaMotivos.ts, sem tabela nova.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Camera,
  CheckCircle2,
  ChevronRight,
  Construction,
  MapPin,
  MessageCircleQuestion,
  Radio,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { RecusarVistoriaFlow } from "./RecusarVistoriaFlow";
import { rsrpParValido } from "@/lib/rsrp";
import type { RecusaMotivo } from "@/lib/glpi/recusaMotivos";

/* ─────────────────────────── tipos do funil ─────────────────────────── */

type StepId =
  | "raiz"
  | "sinal_medir"
  | "sinal_valores"
  | "sinal_ok"
  | "sinal_decisao"
  | "sinal_evidencia"
  | "acesso_tipo"
  | "condominio_contato"
  | "condominio_liberado"
  | "condominio_confirma"
  | "condominio_tentou"
  | "condominio_orienta"
  | "dificil_motivo"
  | "dificil_evidencia"
  | "outro_descricao"
  | "outro_impede"
  | "outro_evidencia";

interface Msg {
  id: number;
  from: "bot" | "user";
  text: string;
  hora: string;
}

interface AssistenteVistoriaProps {
  vistoriaId: string;
  equipamento: string;
  poste?: string | null;
  municipio?: string | null;
  /** Espaço (px) reservado embaixo — cada tela tem sua própria barra inferior; o balão flutua sempre acima dela. */
  bottomOffset?: number;
  /** Impedimento/recusa APROVADO pelo analista — a vistoria saiu da fila, a tela host decide o que fazer (fechar, recarregar, etc.). */
  onRegistrada?: () => void;
}

const DIFICULDADE_OPCOES = [
  { key: "bloqueado", label: "Acesso bloqueado", icone: "🚧" },
  { key: "estrada", label: "Estrada/local inacessível", icone: "🛣️" },
  { key: "clima", label: "Condição climática", icone: "🌧️" },
  { key: "risco", label: "Risco à equipe", icone: "⚠️" },
  { key: "outro", label: "Outro", icone: "•" },
];

let seq = 0;
const nextId = () => ++seq;

function horaAgora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AssistenteVistoria({ vistoriaId, equipamento, poste, municipio, bottomOffset = 24, onRegistrada }: AssistenteVistoriaProps) {
  const [aberto, setAberto] = useState(false);
  const [step, setStep] = useState<StepId>("raiz");
  const [transcript, setTranscript] = useState<Msg[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [live, setLive] = useState<string[]>(["👋 Olá! Vamos resolver isso juntos.", "Precisa de ajuda com esta vistoria?"]);
  const [liveHora, setLiveHora] = useState(() => horaAgora());

  const [chipClaro, setChipClaro] = useState("");
  const [chipVivo, setChipVivo] = useState("");
  const [dificuldade, setDificuldade] = useState("");
  const [descricao, setDescricao] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  const [recusarOpen, setRecusarOpen] = useState(false);
  const [recusarMotivo, setRecusarMotivo] = useState<RecusaMotivo | undefined>(undefined);
  const [recusarRespostas, setRecusarRespostas] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, live, digitando]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  function resetConversa() {
    setStep("raiz");
    setTranscript([]);
    setLive(["👋 Olá! Vamos resolver isso juntos.", "Precisa de ajuda com esta vistoria?"]);
    setLiveHora(horaAgora());
    setChipClaro("");
    setChipVivo("");
    setDificuldade("");
    setDescricao("");
    setFoto(null);
    setFotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDigitando(false);
  }

  function abrir() {
    resetConversa();
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
  }

  /** Usuário respondeu algo: registra a pergunta+resposta no histórico e, com um "digitando…" curto, revela a próxima fala do bot. */
  function avancar(respostaLabel: string, proximoStep: StepId, proximaFala: string[]) {
    setTranscript((t) => [
      ...t,
      ...live.map((linha) => ({ id: nextId(), from: "bot" as const, text: linha, hora: liveHora })),
      { id: nextId(), from: "user" as const, text: respostaLabel, hora: horaAgora() },
    ]);
    setLive([]);
    setDigitando(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setDigitando(false);
      setLiveHora(horaAgora());
      setStep(proximoStep);
      setLive(proximaFala);
    }, 550);
  }

  function handleFoto(file: File | null) {
    setFotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setFoto(file);
  }

  /** Fim de ramo: entrega motivo+respostas+foto pro RecusarVistoriaFlow — mesma aprovação de sempre. */
  function registrar(motivo: RecusaMotivo, respostas: Record<string, string>) {
    setRecusarMotivo(motivo);
    setRecusarRespostas(respostas);
    setAberto(false);
    setRecusarOpen(true);
  }

  const sinalDentroDoPadrao = chipClaro.trim() !== "" && chipVivo.trim() !== "" && rsrpParValido(chipClaro, chipVivo);

  return (
    <>
      {/* balão flutuante — discreto mas com um pulso sutil pra não passar despercebido */}
      {!aberto && (
        <motion.button
          type="button"
          onClick={abrir}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.94 }}
          className="fixed right-4 z-[150] flex items-center gap-2 rounded-full py-3 pl-3.5 pr-4 text-[13px] font-bold text-white"
          style={{
            bottom: bottomOffset,
            background: "linear-gradient(145deg,#00B388,#00875F)",
            boxShadow: "0 8px 22px rgba(0,135,95,0.42), 0 0 0 1px rgba(255,255,255,0.12) inset",
          }}
        >
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/50" style={{ animationDuration: "2.2s" }} />
            <MessageCircleQuestion className="relative h-5 w-5" />
          </span>
          Precisa de ajuda?
        </motion.button>
      )}

      {/* folha de conversa */}
      <AnimatePresence>
        {aberto && (
          <motion.div
            className="fixed inset-0 z-[220] flex flex-col justify-end bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={fechar}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="flex h-[86dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white md:mx-auto md:h-[80dvh] md:max-w-md md:rounded-3xl"
            >
              {/* cabeçalho estilo "contato" — barra colorida, como um chat de verdade */}
              <div
                className="flex items-center gap-3 px-4 py-3 shadow-[0_2px_8px_rgba(0,80,55,0.18)]"
                style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/30">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-white">Assistente de Vistoria</p>
                  <p className="truncate text-[10.5px] text-white/80">
                    {equipamento}
                    {poste ? ` · Poste ${poste}` : ""}
                    {municipio ? ` · ${municipio}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fechar}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* histórico + fala atual — fundo com textura sutil, como o papel de parede de um chat */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4"
                style={{
                  backgroundColor: "#F3F8F6",
                  backgroundImage: "radial-gradient(circle, rgba(0,135,95,0.08) 1px, transparent 1px)",
                  backgroundSize: "16px 16px",
                }}
              >
                {transcript.map((m, i) => (
                  <ChatBolha
                    key={m.id}
                    from={m.from}
                    text={m.text}
                    hora={m.hora}
                    grouped={i > 0 && transcript[i - 1].from === m.from}
                    isLast={!(i < transcript.length - 1 && transcript[i + 1].from === m.from)}
                  />
                ))}
                {live.map((linha, i) => (
                  <ChatBolha
                    key={`live-${step}-${i}`}
                    from="bot"
                    text={linha}
                    hora={liveHora}
                    grouped={i > 0}
                    isLast={i === live.length - 1}
                    delay={i * 0.12}
                  />
                ))}
                {digitando && <ChatDigitando />}

                {/* controles da etapa atual — só depois da fala do bot terminar de "digitar" */}
                {!digitando && (
                  <div className="mt-3">
                    <EtapaControles
                      step={step}
                      chipClaro={chipClaro}
                      chipVivo={chipVivo}
                      dificuldade={dificuldade}
                      descricao={descricao}
                      foto={foto}
                      fotoPreview={fotoPreview}
                      sinalDentroDoPadrao={sinalDentroDoPadrao}
                      setChipClaro={setChipClaro}
                      setChipVivo={setChipVivo}
                      setDificuldade={setDificuldade}
                      setDescricao={setDescricao}
                      onFoto={handleFoto}
                      avancar={avancar}
                      registrar={registrar}
                      fechar={fechar}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RecusarVistoriaFlow
        open={recusarOpen}
        vistoriaId={vistoriaId}
        equipamento={equipamento}
        motivoFixo={recusarMotivo}
        respostasIniciais={recusarRespostas}
        fotoInicial={foto}
        onClose={() => setRecusarOpen(false)}
        onAprovada={() => {
          setRecusarOpen(false);
          onRegistrada?.();
        }}
      />
    </>
  );
}

/* ─────────────────────────── bolhas do chat ─────────────────────────── */

/** Avatar do assistente — só aparece na última bolha de um grupo consecutivo (senão vira só um espaçador, como no WhatsApp). */
function AvatarOuEspaco({ mostrar }: { mostrar: boolean }) {
  if (!mostrar) return <span className="w-6 shrink-0" />;
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-brand-deep shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
      <Sparkles className="h-3 w-3" />
    </span>
  );
}

function ChatBolha({
  from,
  text,
  hora,
  grouped = false,
  isLast = true,
  delay = 0,
}: {
  from: "bot" | "user";
  text: string;
  hora: string;
  grouped?: boolean;
  isLast?: boolean;
  delay?: number;
}) {
  const isUser = from === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`flex items-end gap-2 ${grouped ? "mt-0.5" : "mt-2.5"} ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && <AvatarOuEspaco mostrar={isLast} />}
      <div
        className={`relative max-w-[80%] px-3.5 py-2 text-[13.5px] leading-relaxed shadow-[0_1px_1.5px_rgba(0,0,0,0.1)] ${
          isUser
            ? `rounded-2xl font-medium text-white ${isLast ? "rounded-br-md" : ""}`
            : `rounded-2xl text-ink ${isLast ? "rounded-bl-md" : ""}`
        }`}
        style={{ background: isUser ? "linear-gradient(145deg,#00B388,#00875F)" : "#ffffff" }}
      >
        {text}
        <span className={`mt-1 block text-right text-[9.5px] ${isUser ? "text-white/75" : "text-ink-muted/70"}`}>
          {hora}
        </span>
        {isLast && (
          <span
            aria-hidden
            className="absolute bottom-0 h-2.5 w-2.5"
            style={
              isUser
                ? { right: -6, background: "#00875F", clipPath: "polygon(0 0, 100% 100%, 0 100%)" }
                : { left: -6, background: "#ffffff", clipPath: "polygon(100% 0, 0% 100%, 100% 100%)" }
            }
          />
        )}
      </div>
    </motion.div>
  );
}

function ChatDigitando() {
  return (
    <div className="mt-2.5 flex items-end gap-2">
      <AvatarOuEspaco mostrar />
      <div className="relative flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-[0_1px_1.5px_rgba(0,0,0,0.1)]">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-ink-muted/60"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
        <span aria-hidden className="absolute bottom-0 h-2.5 w-2.5" style={{ left: -6, background: "#ffffff", clipPath: "polygon(100% 0, 0% 100%, 100% 100%)" }} />
      </div>
    </div>
  );
}

/** Botão de resposta rápida — grande, fácil de tocar em celular. */
function BotaoResposta({
  onClick,
  children,
  variant = "neutro",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "neutro" | "impedimento" | "recusa" | "sucesso";
}) {
  const estilos: Record<string, string> = {
    neutro: "border-brand-steel/70 bg-white text-ink hover:border-brand-emerald/50",
    impedimento: "border-amber-300 bg-amber-50 text-amber-800",
    recusa: "border-red-200 bg-red-50 text-red-700",
    sucesso: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-[13.5px] font-semibold transition active:scale-[0.98] ${estilos[variant]}`}
    >
      <span className="flex items-center gap-2">{children}</span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
    </button>
  );
}

/* ─────────────────────────── etapas do funil ─────────────────────────── */

interface EtapaControlesProps {
  step: StepId;
  chipClaro: string;
  chipVivo: string;
  dificuldade: string;
  descricao: string;
  foto: File | null;
  fotoPreview: string | null;
  sinalDentroDoPadrao: boolean;
  setChipClaro: (v: string) => void;
  setChipVivo: (v: string) => void;
  setDificuldade: (v: string) => void;
  setDescricao: (v: string) => void;
  onFoto: (f: File | null) => void;
  avancar: (respostaLabel: string, proximoStep: StepId, proximaFala: string[]) => void;
  registrar: (motivo: RecusaMotivo, respostas: Record<string, string>) => void;
  fechar: () => void;
}

function CampoFoto({ fotoPreview, onFoto, label = "Tirar ou escolher foto" }: { fotoPreview: string | null; onFoto: (f: File | null) => void; label?: string }) {
  return fotoPreview ? (
    <div className="relative overflow-hidden rounded-2xl border border-brand-steel/60">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fotoPreview} alt="Evidência" className="h-36 w-full object-cover" />
      <button
        type="button"
        onClick={() => onFoto(null)}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
        aria-label="Remover foto"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  ) : (
    <label className="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-brand-steel/70 bg-brand-ice/60 text-ink-muted">
      <Camera className="h-5 w-5" />
      <span className="text-[12px] font-medium">{label}</span>
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFoto(e.target.files?.[0] ?? null)} />
    </label>
  );
}

function EtapaControles(p: EtapaControlesProps) {
  switch (p.step) {
    case "raiz":
      return (
        <div className="space-y-2">
          <BotaoResposta onClick={() => p.avancar("📡 Sinal ruim", "sinal_medir", ["Entendi. Vamos verificar o sinal antes de tomar qualquer decisão. 📶", "Você consegue realizar uma medição das duas operadoras?"])}>
            <Radio className="h-4 w-4 text-brand-emerald" /> Sinal ruim
          </BotaoResposta>
          <BotaoResposta onClick={() => p.avancar("📍 Local de difícil acesso", "acesso_tipo", ["Entendi. Vamos verificar se o acesso pode ser realizado.", "O local fica dentro de um condomínio ou possui alguma restrição de acesso?"])}>
            <MapPin className="h-4 w-4 text-brand-emerald" /> Local de difícil acesso
          </BotaoResposta>
          <BotaoResposta onClick={() => p.avancar("⚠️ Outro problema", "outro_descricao", ["Claro. Me conte o que aconteceu."])}>
            <AlertTriangle className="h-4 w-4 text-brand-emerald" /> Outro problema
          </BotaoResposta>
        </div>
      );

    /* ── SINAL RUIM ─────────────────────────────────────────────────── */
    case "sinal_medir":
      return (
        <div className="space-y-2">
          <BotaoResposta onClick={() => p.avancar("Sim, consigo", "sinal_valores", ["Perfeito 👍", "Informe o RSRP encontrado nas duas operadoras."])}>
            Sim, consigo
          </BotaoResposta>
          <BotaoResposta onClick={() => p.avancar("Não consigo", "sinal_evidencia", ["Sem problema.", "Para registrar a situação corretamente, precisamos documentar o que você encontrou no local."])}>
            Não consigo
          </BotaoResposta>
        </div>
      );

    case "sinal_valores":
      return (
        <div className="space-y-3 rounded-2xl border border-brand-steel/60 bg-white p-3.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-600">Claro</p>
            <label className="mt-1.5 block text-[10px] font-bold uppercase tracking-wide text-ink-muted">RSRP</label>
            <input
              inputMode="numeric"
              value={p.chipClaro}
              onChange={(e) => p.setChipClaro(e.target.value)}
              placeholder="Ex.: -95"
              className="mt-1 w-full rounded-xl border border-brand-steel/60 bg-brand-ice/60 px-3 py-2 text-[14px] font-medium text-ink outline-none focus:border-brand-emerald/60"
            />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-700">Vivo</p>
            <label className="mt-1.5 block text-[10px] font-bold uppercase tracking-wide text-ink-muted">RSRP</label>
            <input
              inputMode="numeric"
              value={p.chipVivo}
              onChange={(e) => p.setChipVivo(e.target.value)}
              placeholder="Ex.: -95"
              className="mt-1 w-full rounded-xl border border-brand-steel/60 bg-brand-ice/60 px-3 py-2 text-[14px] font-medium text-ink outline-none focus:border-brand-emerald/60"
            />
          </div>
          <button
            type="button"
            disabled={!p.chipClaro.trim() || !p.chipVivo.trim()}
            onClick={() => {
              const resumo = `RSRP Claro ${p.chipClaro} · Vivo ${p.chipVivo}`;
              if (p.sinalDentroDoPadrao) {
                p.avancar(resumo, "sinal_ok", ["🟢 Tudo certo!", "O RSRP das duas operadoras está dentro do padrão aceito pela CPFL.", "Você pode prosseguir com a vistoria."]);
              } else {
                p.avancar(resumo, "sinal_decisao", ["🔴 O RSRP informado está fora do padrão aceito pela CPFL nas duas operadoras (≤ -102).", "Isso caracteriza recusa da vistoria."]);
              }
            }}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-emerald text-[13.5px] font-bold text-[#073B4C] disabled:opacity-40"
          >
            Continuar <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      );

    case "sinal_ok":
      return (
        <BotaoResposta variant="sucesso" onClick={() => p.fechar()}>
          <CheckCircle2 className="h-4 w-4" /> Continuar vistoria
        </BotaoResposta>
      );

    case "sinal_decisao":
      return (
        <BotaoResposta variant="recusa" onClick={() => p.registrar("SINAL_FORA_PADRAO", { rsrp_claro: p.chipClaro, rsrp_vivo: p.chipVivo })}>
          <X className="h-4 w-4" /> Recusar vistoria
        </BotaoResposta>
      );

    case "sinal_evidencia":
      return (
        <div className="space-y-2.5">
          <CampoFoto fotoPreview={p.fotoPreview} onFoto={p.onFoto} label="Foto da tela/equipamento de medição" />
          <button
            type="button"
            disabled={!p.foto}
            onClick={() => p.registrar("SINAL_SEM_MEDICAO", {})}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 text-[13.5px] font-bold text-red-700 disabled:opacity-40"
          >
            <X className="h-4 w-4" /> Recusar vistoria
          </button>
          <button type="button" onClick={() => p.avancar("Voltar", "sinal_medir", ["Sem problema, vamos de novo.", "Você consegue realizar uma medição das duas operadoras?"])} className="w-full py-1 text-center text-[12px] font-semibold text-ink-muted underline-offset-2 hover:underline">
            Voltar
          </button>
        </div>
      );

    /* ── ACESSO ─────────────────────────────────────────────────────── */
    case "acesso_tipo":
      return (
        <div className="space-y-2">
          <BotaoResposta onClick={() => p.avancar("🏢 Condomínio", "condominio_contato", ["Você conseguiu contato com o responsável pela entrada ou administração do condomínio?"])}>
            <Construction className="h-4 w-4 text-brand-emerald" /> Condomínio
          </BotaoResposta>
          <BotaoResposta onClick={() => p.avancar("📍 Área de difícil acesso", "dificil_motivo", ["Entendi.", "Qual é a dificuldade encontrada para acessar o local?"])}>
            <MapPin className="h-4 w-4 text-brand-emerald" /> Área de difícil acesso
          </BotaoResposta>
        </div>
      );

    case "condominio_contato":
      return (
        <div className="space-y-2">
          <BotaoResposta onClick={() => p.avancar("Sim", "condominio_liberado", ["O acesso foi liberado?"])}>Sim</BotaoResposta>
          <BotaoResposta onClick={() => p.avancar("Não", "condominio_tentou", ["Antes de registrar o impedimento, recomendamos tentar contato com a administração ou responsável pelo local.", "Você já tentou contato com o responsável?"])}>Não</BotaoResposta>
        </div>
      );

    case "condominio_liberado":
      return (
        <div className="space-y-2">
          <BotaoResposta variant="sucesso" onClick={() => p.avancar("Sim, acesso liberado", "sinal_ok", ["Perfeito 👍", "O acesso foi liberado. Você pode prosseguir com a vistoria."])}>
            Sim, acesso liberado
          </BotaoResposta>
          <BotaoResposta variant="impedimento" onClick={() => p.avancar("Não, acesso bloqueado", "condominio_confirma", ["Entendi.", "Como o acesso permanece bloqueado, podemos registrar um impedimento para esta vistoria.", "Deseja registrar o impedimento?"])}>
            Não, acesso bloqueado
          </BotaoResposta>
        </div>
      );

    case "condominio_confirma":
      return (
        <div className="space-y-2">
          <BotaoResposta variant="impedimento" onClick={() => p.registrar("CONDOMINIO_ACESSO_BLOQUEADO", {})}>
            <Ban className="h-4 w-4" /> Sim, registrar impedimento
          </BotaoResposta>
          <button type="button" onClick={() => p.avancar("Voltar", "condominio_liberado", ["Sem problema.", "O acesso foi liberado?"])} className="w-full py-1 text-center text-[12px] font-semibold text-ink-muted underline-offset-2 hover:underline">
            Voltar
          </button>
        </div>
      );

    case "condominio_tentou":
      return (
        <div className="space-y-2">
          <BotaoResposta variant="impedimento" onClick={() => p.avancar("Sim, tentei", "condominio_orienta", ["Entendido.", "Como não foi possível obter acesso ao local, você pode registrar o impedimento."])}>
            Sim, tentei
          </BotaoResposta>
          <BotaoResposta onClick={() => p.avancar("Ainda não", "condominio_orienta", ["Sem problema.", "Tente contato com o responsável pelo local antes de registrar o impedimento."])}>
            Ainda não
          </BotaoResposta>
        </div>
      );

    case "condominio_orienta":
      // Mesma tela serve os dois casos ("já tentei" e "ainda não") — o texto
      // que muda é a fala acima; só o botão de ação difere.
      return (
        <div className="space-y-2">
          <BotaoResposta variant="impedimento" onClick={() => p.registrar("CONDOMINIO_SEM_CONTATO", {})}>
            <Ban className="h-4 w-4" /> Registrar impedimento
          </BotaoResposta>
          <button type="button" onClick={() => p.fechar()} className="w-full py-1 text-center text-[12px] font-semibold text-ink-muted underline-offset-2 hover:underline">
            Entendi, vou tentar contato
          </button>
        </div>
      );

    case "dificil_motivo":
      return (
        <div className="grid grid-cols-1 gap-1.5">
          {DIFICULDADE_OPCOES.map((o) => (
            <BotaoResposta
              key={o.key}
              onClick={() => {
                p.setDificuldade(o.label);
                p.avancar(`${o.icone} ${o.label}`, "dificil_evidencia", ["Entendido.", "Para documentar corretamente a situação, precisamos de evidências do local."]);
              }}
            >
              <span>{o.icone}</span> {o.label}
            </BotaoResposta>
          ))}
        </div>
      );

    case "dificil_evidencia":
      return (
        <div className="space-y-2.5">
          <CampoFoto fotoPreview={p.fotoPreview} onFoto={p.onFoto} label="Fotos do local" />
          <textarea
            value={p.descricao}
            onChange={(e) => p.setDescricao(e.target.value)}
            rows={2}
            placeholder='Ex.: "Local sem acesso disponível para a equipe no momento da vistoria."'
            className="w-full resize-none rounded-2xl border border-brand-steel/60 bg-brand-ice/60 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand-emerald/60"
          />
          <button
            type="button"
            disabled={!p.foto || !p.descricao.trim()}
            onClick={() => p.registrar("AREA_DIFICIL_ACESSO", { dificuldade: p.dificuldade, descricao: p.descricao })}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold text-amber-800 disabled:opacity-40"
            style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}
          >
            <Ban className="h-4 w-4" /> Registrar impedimento
          </button>
        </div>
      );

    /* ── OUTRO PROBLEMA ─────────────────────────────────────────────── */
    case "outro_descricao":
      return (
        <div className="space-y-2.5">
          <textarea
            value={p.descricao}
            onChange={(e) => p.setDescricao(e.target.value)}
            rows={3}
            placeholder="Descreva o problema…"
            className="w-full resize-none rounded-2xl border border-brand-steel/60 bg-brand-ice/60 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand-emerald/60"
          />
          <button
            type="button"
            disabled={p.descricao.trim().length < 4}
            onClick={() => p.avancar(p.descricao.trim(), "outro_impede", ["Entendi.", "Esse problema impede a realização da vistoria?"])}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-emerald text-[13.5px] font-bold text-[#073B4C] disabled:opacity-40"
          >
            Continuar <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      );

    case "outro_impede":
      return (
        <div className="space-y-2">
          <BotaoResposta variant="impedimento" onClick={() => p.avancar("Sim, impede", "outro_evidencia", ["⚠️ Nesse caso, vamos registrar o problema como impedimento.", "Se tiver, anexe uma foto do local (opcional)."])}>
            Sim, impede
          </BotaoResposta>
          <BotaoResposta variant="sucesso" onClick={() => p.avancar("Não, consigo prosseguir", "sinal_ok", ["Perfeito 👍", "Se o problema não impede a realização da vistoria, você pode continuar normalmente."])}>
            Não, consigo prosseguir
          </BotaoResposta>
        </div>
      );

    case "outro_evidencia":
      return (
        <div className="space-y-2.5">
          <CampoFoto fotoPreview={p.fotoPreview} onFoto={p.onFoto} label="Foto do local (opcional)" />
          <button
            type="button"
            onClick={() => p.registrar("OUTRO_PROBLEMA_IMPEDE", { descricao: p.descricao })}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold text-amber-800"
            style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}
          >
            <Ban className="h-4 w-4" /> Confirmar impedimento
          </button>
        </div>
      );

    default:
      return null;
  }
}
