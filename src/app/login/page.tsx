"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  MapPinned,
  Wrench,
  User,
} from "lucide-react";
import { authService, persist } from "@/services/auth";
import { liberarAcessoService } from "@/services/liberarAcesso";
import { deriveAndStoreHash, markUnlockedToday } from "@/services/lock";
import { getDeviceId, getDeviceModel } from "@/lib/device";
import { useAuthStore } from "@/store/auth";
import { asset } from "@/utils/asset";
import type { AuthSession, Modulo } from "@/types";

interface FormValues {
  login: string;
  senha: string;
  codigo: string;
}

const REMEMBER_KEY = "vistomap.login.usuario";

/** Pra onde cada módulo leva depois do login. */
const MODULO_HOME: Record<Modulo, string> = {
  vistoria: "/dashboard",
  instalacao: "/instalacao",
};

export default function LoginPage() {
  const router = useRouter();
  const { setSession, hydrated, session, logout } = useAuthStore();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aparelho não vinculado — em vez de mandar pra outra tela, pede o código
  // de ativação ali mesmo (gerado antes em /liberar-acesso, no navegador).
  const [precisaCodigo, setPrecisaCodigo] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  // Sessão recém-autenticada com os dois módulos — aguardando escolha.
  const [escolhaPendente, setEscolhaPendente] = useState<AuthSession | null>(null);

  // Só roda na hidratação inicial (sessão já existente de antes, reabriu o
  // app) — depende só de `hydrated` de propósito, pra não disparar de novo
  // (e brigar com o redirect explícito da escolha de módulo) quando o login
  // desta página chama setSession.
  useEffect(() => {
    if (!hydrated || !session) return;
    // Sessão de ANTES do módulo de Instalação existir não tem `modulos` —
    // não dá pra confiar nela pra decidir o destino (cairia sempre em
    // Vistoria, mesmo pra quem virou instalador depois). Desloga e deixa
    // cair no formulário: login de novo já busca o grupo atual certinho.
    if (!session.modulos || session.modulos.length === 0) {
      logout();
      return;
    }
    // Com os dois módulos, não guardamos qual foi usado da última vez (não
    // precisa lembrar), então uma sessão pré-existente cai em Vistoria.
    const modulo: Modulo = session.modulos.includes("instalacao") && !session.modulos.includes("vistoria")
      ? "instalacao"
      : "vistoria";
    router.replace(MODULO_HOME[modulo]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function entrarNoModulo(next: AuthSession, modulo: Modulo) {
    setSession(next);
    router.replace(MODULO_HOME[modulo]);
  }

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { login: "", senha: "", codigo: "" },
  });

  // Só depois do mount (evita mismatch de hidratação — localStorage não
  // existe no HTML estático do build). Preenche o usuário lembrado da
  // última vez, se houver.
  useEffect(() => {
    const salvo = window.localStorage.getItem(REMEMBER_KEY);
    if (salvo) {
      setValue("login", salvo);
      setLembrar(true);
    }
  }, [setValue]);

  /** Comum aos dois caminhos (login normal e ativação por código). */
  const finalizarLogin = (next: AuthSession, senhaDigitada: string, loginDigitado: string) => {
    void deriveAndStoreHash(senhaDigitada);
    markUnlockedToday();
    if (lembrar) {
      window.localStorage.setItem(REMEMBER_KEY, loginDigitado.trim());
    } else {
      window.localStorage.removeItem(REMEMBER_KEY);
    }
    const modulos = next.modulos ?? ["vistoria"];
    if (modulos.length > 1) {
      // Tem acesso aos dois módulos — pergunta qual, não decide sozinho.
      setEscolhaPendente(next);
      return;
    }
    entrarNoModulo(next, modulos[0]);
  };

  const onSubmit = async (values: FormValues) => {
    setError(null);

    // Aparelho já identificado como não vinculado — o "Entrar" agora troca
    // o código pelo vínculo de verdade, sem repetir login/senha (o código
    // já prova a identidade, foi gerado depois de conferir tudo isso).
    if (precisaCodigo) {
      if (!values.codigo?.trim() || values.codigo.trim().length !== 6) {
        setError("Digite os 6 dígitos do código de ativação.");
        return;
      }
      try {
        const deviceId = await getDeviceId();
        if (!deviceId) {
          setError(
            "Este aplicativo instalado é de uma versão antiga e não consegue se vincular. " +
              "Abra vistomap.nansen.com.br/liberar-acesso pelo navegador do celular (não por este app) " +
              "pra baixar a versão nova."
          );
          return;
        }
        const deviceModel = await getDeviceModel();
        const session = await liberarAcessoService.confirmar(values.codigo.trim(), deviceId, deviceModel);
        persist(session);
        finalizarLogin(session, values.senha, values.login);
      } catch (err) {
        const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
        setError(data?.message ?? "Não foi possível confirmar o código. Tente novamente.");
      }
      return;
    }

    try {
      const next = await authService.login(values);
      finalizarLogin(next, values.senha, values.login);
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string; code?: string } } })
        ?.response?.data;
      if (data?.code === "DEVICE_NOT_BOUND") {
        setPrecisaCodigo(true);
      }
      setError(
        data?.message ??
          (err instanceof Error ? err.message : "Não foi possível autenticar. Verifique suas credenciais.")
      );
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-x-hidden text-brand-ice">
      {/* Imagem de fundo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset("/banner_app.png")}
        alt=""
        aria-hidden
        className="absolute inset-0 z-0 h-full w-full select-none object-cover"
        draggable={false}
      />
      {/* Overlay escuro */}
      <div
        aria-hidden
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,59,76,0.55) 0%, rgba(7,59,76,0.82) 60%, rgba(7,59,76,0.96) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-end px-4 pb-[max(env(safe-area-inset-bottom),10dvh)] md:min-h-[100dvh] md:justify-center md:py-16">
        {escolhaPendente ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 0.7, 0.2, 1] }}
            className="flex flex-col"
          >
            <header className="text-center">
              <h1 className="text-[15px] font-semibold tracking-tight text-white">
                Qual módulo você vai usar?
              </h1>
              <p className="mt-0.5 text-[11px] font-medium text-white/65">
                Sua conta tem acesso aos dois — escolha pra continuar
              </p>
            </header>

            <div className="mt-4 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => entrarNoModulo(escolhaPendente, "vistoria")}
                className="flex items-center gap-3 rounded-[9px] border border-white/12 bg-white/[0.04] px-4 py-3.5 text-left transition hover:border-brand-emerald/60 hover:bg-white/[0.07] active:scale-[0.985]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald">
                  <MapPinned className="h-[18px] w-[18px]" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[14px] font-bold text-white">Vistoria</span>
                  <span className="text-[11.5px] text-white/55">Vistoriar postes em campo</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => entrarNoModulo(escolhaPendente, "instalacao")}
                className="flex items-center gap-3 rounded-[9px] border border-white/12 bg-white/[0.04] px-4 py-3.5 text-left transition hover:border-brand-emerald/60 hover:bg-white/[0.07] active:scale-[0.985]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald">
                  <Wrench className="h-[18px] w-[18px]" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[14px] font-bold text-white">Instalação</span>
                  <span className="text-[11.5px] text-white/55">Instalar equipamentos liberados</span>
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setEscolhaPendente(null)}
              className="mt-4 self-center text-[12px] font-medium text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
            >
              Voltar
            </button>
          </motion.div>
        ) : (
        <motion.form
          onSubmit={handleSubmit(onSubmit)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 0.7, 0.2, 1], delay: 0.08 }}
          className="flex flex-col"
        >
          <header className="text-center">
            <h1 className="text-[15px] font-semibold tracking-tight text-white">
              Acesso operacional
            </h1>
            <p className="mt-0.5 text-[11px] font-medium text-white/65">
              Entre com suas credenciais GIOC para continuar
            </p>
          </header>

          <div className="mt-2 space-y-1.5">
            {/* Usuário */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Usuário
              </label>
              <div className="group mt-0.5 flex h-[38px] items-center gap-2.5 rounded-[9px] border border-white/12 bg-white/[0.04] px-3 transition focus-within:border-brand-emerald/70 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(6,214,160,0.12)]">
                <User className="h-[13px] w-[13px] shrink-0 text-white/45 transition group-focus-within:text-brand-emerald" />
                <input
                  type="text"
                  placeholder="seu.usuario"
                  autoComplete="username"
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
                  {...register("login", { required: "Informe seu usuário" })}
                />
              </div>
              {errors.login?.message && (
                <span className="mt-1.5 block text-xs text-red-200">
                  {errors.login.message}
                </span>
              )}
            </div>

            {/* Senha */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Senha
              </label>
              <div className="group mt-0.5 flex h-[38px] items-center gap-2.5 rounded-[9px] border border-white/12 bg-white/[0.04] px-3 transition focus-within:border-brand-emerald/70 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(6,214,160,0.12)]">
                <Lock className="h-[13px] w-[13px] shrink-0 text-white/45 transition group-focus-within:text-brand-emerald" />
                <input
                  type={show ? "text" : "password"}
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
                  {...register("senha", {
                    required: "Informe sua senha",
                    minLength: { value: 4, message: "Senha muito curta" },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/55 transition hover:bg-white/8 hover:text-white"
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                >
                  {show ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
              {errors.senha?.message && (
                <span className="mt-1.5 block text-xs text-red-200">
                  {errors.senha.message}
                </span>
              )}
            </div>

            {precisaCodigo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.3 }}
              >
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-emerald">
                  Código de ativação
                </label>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-white/55">
                  Este aparelho ainda não está vinculado. Digite o código de 6
                  dígitos gerado em vistomap.nansen.com.br/liberar-acesso.
                </p>
                <div className="group mt-1 flex h-[38px] items-center gap-2.5 rounded-[9px] border border-brand-emerald/40 bg-brand-emerald/[0.06] px-3 transition focus-within:border-brand-emerald/70 focus-within:shadow-[0_0_0_3px_rgba(6,214,160,0.12)]">
                  <KeyRound className="h-[13px] w-[13px] shrink-0 text-brand-emerald" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="h-full min-w-0 flex-1 bg-transparent text-center font-mono text-[16px] font-bold tracking-[0.3em] text-white outline-none placeholder:text-white/25"
                    {...register("codigo")}
                    onChange={(e) => {
                      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
                    }}
                  />
                </div>
              </motion.div>
            )}
          </div>

          {!precisaCodigo && (
            <label className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-white/70">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(e) => setLembrar(e.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-white/10 accent-brand-emerald"
              />
              Lembrar meu usuário
            </label>
          )}

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
            className="mt-3 flex h-[40px] w-full items-center justify-center gap-2 rounded-[9px] bg-brand-emerald px-5 text-[15px] font-bold tracking-tight text-[#073B4C] shadow-[0_14px_36px_rgba(6,214,160,0.30),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-brand-emerald/40 transition hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : precisaCodigo ? (
              <>
                Ativar e entrar
                <ArrowRight className="h-[18px] w-[18px]" />
              </>
            ) : (
              <>
                Entrar na plataforma
                <ArrowRight className="h-[18px] w-[18px]" />
              </>
            )}
          </button>

          {precisaCodigo && (
            <a
              href="/liberar-acesso"
              className="mt-3 self-center text-[12px] font-medium text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
            >
              Não tenho um código ainda — gerar um novo
            </a>
          )}
        </motion.form>
        )}

        <footer className="mt-6 flex flex-col items-center gap-1.5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset("/nansen.png")}
            alt="Nansen"
            className="h-5 w-auto opacity-80"
            draggable={false}
          />
          <p className="text-[10.5px] leading-relaxed text-white/45">
            Plataforma VistoMap · Todos os direitos reservados © 2026
            <br />
            Seus dados são tratados em conformidade com a Lei Geral de Proteção de
            Dados (LGPD – Lei nº 13.709/2018).
          </p>
        </footer>
      </div>
    </main>
  );
}
