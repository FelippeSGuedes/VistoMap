"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe,
  IdCard,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { liberarAcessoService } from "@/services/liberarAcesso";
import { persist } from "@/services/auth";
import { useAuthStore } from "@/store/auth";
import { getDeviceId, getDeviceModel, isNativeApp } from "@/lib/device";
import { ScrollGate } from "@/components/liberar-acesso/ScrollGate";
import { TermoResponsabilidadeContent } from "@/components/legal/TermoResponsabilidadeContent";
import { asset } from "@/utils/asset";
import type { AuthSession, Modulo } from "@/types";

const APK_DOWNLOAD_URL = "https://vistomap.nansen.com.br/downloads/vistomap.apk";

const MODULO_HOME: Record<Modulo, string> = {
  vistoria: "/dashboard",
  instalacao: "/instalacao",
};

function dispararDownload() {
  const a = document.createElement("a");
  a.href = APK_DOWNLOAD_URL;
  a.download = "vistomap.apk";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function LiberarAcessoPage() {
  const router = useRouter();
  // null = ainda não sabemos (evita mismatch de hidratação — isNativeApp()
  // só é confiável depois do mount, no browser). Dentro do app (nativo), o
  // /login agora é quem cuida de tudo — login normal E o campo de código de
  // ativação (aparece sozinho se o aparelho não estiver vinculado). Só o
  // navegador comum (fora do app, antes de instalar) mostra o formulário
  // completo aqui.
  const [nativo, setNativo] = useState<boolean | null>(null);
  useEffect(() => {
    const ehNativo = isNativeApp();
    setNativo(ehNativo);
    if (ehNativo) router.replace("/login");
  }, [router]);

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-x-hidden text-brand-ice">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset("/banner_app.png")}
        alt=""
        aria-hidden
        className="absolute inset-0 z-0 h-full w-full select-none object-cover"
        draggable={false}
      />
      <div
        aria-hidden
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,59,76,0.55) 0%, rgba(7,59,76,0.82) 60%, rgba(7,59,76,0.96) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-4 py-10">
        {nativo === null || nativo ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
          </div>
        ) : (
          <FluxoNoNavegador />
        )}

        <footer className="mt-6 flex flex-col items-center gap-1.5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset("/nansen.png")} alt="Nansen" className="h-5 w-auto opacity-80" draggable={false} />
          <p className="text-[10.5px] leading-relaxed text-white/45">
            Plataforma VistoMap · Todos os direitos reservados © 2026
          </p>
        </footer>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   FLUXO NO NAVEGADOR — app ainda não instalado.
   form (identidade) → termo (scroll obrigatório) → código + download.
   ═══════════════════════════════════════════════════════════════════════ */

interface FormValues {
  nome: string;
  email: string;
  matricula: string;
  senha: string;
}

type EtapaNavegador = "form" | "termo" | "codigo";

function FluxoNoNavegador() {
  const [etapa, setEtapa] = useState<EtapaNavegador>("form");
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [nomeConfirmado, setNomeConfirmado] = useState("");
  const [aceitando, setAceitando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { nome: "", email: "", matricula: "", senha: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const result = await liberarAcessoService.validar(values);
      setTicket(result.ticket);
      setNomeConfirmado(result.nome);
      setEtapa("termo");
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Não foi possível validar seus dados. Tente novamente."
      );
    }
  };

  const onAceitar = async () => {
    if (!ticket) return;
    setAceitando(true);
    setError(null);
    try {
      const result = await liberarAcessoService.gerarCodigo(ticket);
      setCodigo(result.codigo);
      setEtapa("codigo");
      dispararDownload();
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Não foi possível concluir a ativação. Tente novamente."
      );
    } finally {
      setAceitando(false);
    }
  };

  const copiarCodigo = () => {
    if (!codigo) return;
    navigator.clipboard?.writeText(codigo).then(() => {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    });
  };

  return (
    <AnimatePresence mode="wait">
      {etapa === "form" && (
        <motion.form
          key="form"
          onSubmit={handleSubmit(onSubmit)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 0.7, 0.2, 1] }}
          className="flex flex-col"
        >
          <header className="text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-emerald/15 text-brand-emerald">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="mt-3 text-[16px] font-semibold tracking-tight text-white">
              Liberar acesso ao VistoMap
            </h1>
            <p className="mt-1 text-[11.5px] font-medium leading-relaxed text-white/65">
              Confirme seus dados de cadastro. Use as mesmas credenciais do
              login — no final você recebe o link do aplicativo.
            </p>
          </header>

          <div className="mt-5 space-y-2.5">
            <Campo
              icon={<User className="h-[13px] w-[13px]" />}
              label="Nome completo"
              placeholder="Como está no seu cadastro"
              autoComplete="name"
              registro={register("nome", { required: "Informe seu nome completo" })}
              erro={errors.nome?.message}
            />
            <Campo
              icon={<Mail className="h-[13px] w-[13px]" />}
              label="E-mail corporativo"
              placeholder="seu.email@nansen.com.br"
              type="email"
              autoComplete="email"
              registro={register("email", { required: "Informe seu e-mail" })}
              erro={errors.email?.message}
            />
            <Campo
              icon={<IdCard className="h-[13px] w-[13px]" />}
              label="Matrícula"
              placeholder="Sua matrícula Nansen"
              autoComplete="off"
              registro={register("matricula", { required: "Informe sua matrícula" })}
              erro={errors.matricula?.message}
            />
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Senha
              </label>
              <div className="group mt-0.5 flex h-[38px] items-center gap-2.5 rounded-[9px] border border-white/12 bg-white/[0.04] px-3 transition focus-within:border-brand-emerald/70 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(6,214,160,0.12)]">
                <Lock className="h-[13px] w-[13px] shrink-0 text-white/45 transition group-focus-within:text-brand-emerald" />
                <input
                  type={show ? "text" : "password"}
                  placeholder="A mesma senha do login"
                  autoComplete="current-password"
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
                  {...register("senha", { required: "Informe sua senha" })}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/55 transition hover:bg-white/8 hover:text-white"
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                >
                  {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {errors.senha?.message && (
                <span className="mt-1.5 block text-xs text-red-200">{errors.senha.message}</span>
              )}
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-red-300/40 bg-red-500/12 px-3 py-2 text-sm text-red-100"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 flex h-[40px] w-full items-center justify-center gap-2 rounded-[9px] bg-brand-emerald px-5 text-[15px] font-bold tracking-tight text-[#073B4C] shadow-[0_14px_36px_rgba(6,214,160,0.30),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-brand-emerald/40 transition hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Continuar
                <ArrowRight className="h-[18px] w-[18px]" />
              </>
            )}
          </button>
        </motion.form>
      )}

      {etapa === "termo" && (
        <motion.div
          key="termo"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 0.7, 0.2, 1] }}
          className="flex flex-col"
        >
          <header className="text-center">
            <h1 className="text-[16px] font-semibold tracking-tight text-white">
              Termo de responsabilidade
            </h1>
            <p className="mt-1 text-[11.5px] font-medium text-white/65">
              Olá, {nomeConfirmado.split(" ")[0]} — leia até o fim pra continuar
            </p>
          </header>

          <div className="mt-4">
            <ScrollGate content={<TermoResponsabilidadeContent />}>
              {(rolouAteOFim) => (
                <>
                  {error && (
                    <div className="mt-3 rounded-2xl border border-red-300/40 bg-red-500/12 px-3 py-2 text-sm text-red-100">
                      {error}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!rolouAteOFim || aceitando}
                    onClick={onAceitar}
                    className="mt-3 flex h-[42px] w-full items-center justify-center gap-2 rounded-[9px] bg-brand-emerald px-5 text-[15px] font-bold tracking-tight text-[#073B4C] shadow-[0_14px_36px_rgba(6,214,160,0.30),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-brand-emerald/40 transition hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aceitando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <BadgeCheck className="h-[18px] w-[18px]" />
                        {rolouAteOFim ? "Aceito e quero ativar" : "Role até o fim pra continuar"}
                      </>
                    )}
                  </button>
                </>
              )}
            </ScrollGate>
          </div>
        </motion.div>
      )}

      {etapa === "codigo" && codigo && (
        <motion.div
          key="codigo"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-[16px] font-semibold tracking-tight text-white">
            Identidade confirmada!
          </h1>
          <p className="mt-1 max-w-[320px] text-[12px] leading-relaxed text-white/65">
            O download do aplicativo já começou. Depois de instalar, abra o
            app e digite este código pra concluir a ativação:
          </p>

          <button
            type="button"
            onClick={copiarCodigo}
            className="mt-5 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 transition hover:bg-white/[0.1]"
          >
            <span className="font-mono text-[28px] font-bold tracking-[0.3em] text-white">{codigo}</span>
            <Copy className="h-4 w-4 text-white/50" />
          </button>
          {copiado && <span className="mt-1.5 text-[11px] text-brand-emerald">Copiado!</span>}

          <p className="mt-4 text-[11px] text-white/45">Válido por 15 minutos.</p>

          <button
            type="button"
            onClick={dispararDownload}
            className="mt-6 flex h-[40px] items-center justify-center gap-2 rounded-[9px] bg-brand-emerald px-5 text-[14px] font-bold tracking-tight text-[#073B4C] shadow-[0_14px_36px_rgba(6,214,160,0.30)]"
          >
            <Download className="h-[16px] w-[16px]" />
            Baixar o aplicativo de novo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Campo({
  icon,
  label,
  placeholder,
  type = "text",
  autoComplete,
  registro,
  erro,
}: {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  registro: ReturnType<ReturnType<typeof useForm<FormValues>>["register"]>;
  erro?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </label>
      <div className="group mt-0.5 flex h-[38px] items-center gap-2.5 rounded-[9px] border border-white/12 bg-white/[0.04] px-3 transition focus-within:border-brand-emerald/70 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(6,214,160,0.12)]">
        <span className="shrink-0 text-white/45 transition group-focus-within:text-brand-emerald">{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
          {...registro}
        />
      </div>
      {erro && <span className="mt-1.5 block text-xs text-red-200">{erro}</span>}
    </div>
  );
}
