"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  User,
} from "lucide-react";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/store/auth";
import { asset } from "@/utils/asset";

interface FormValues {
  login: string;
  senha: string;
}

const REMEMBER_KEY = "vistomap.login.usuario";
/** Congela o vídeo de fundo nesse instante — vira um "poster" estático. */
const VIDEO_FREEZE_AT = 6;

export default function LoginPage() {
  const router = useRouter();
  const { setSession, hydrated, session } = useAuthStore();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lembrar, setLembrar] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Toca o vídeo de fundo até os 6s e trava nesse frame — vira um "poster"
  // vivo (deixa de gastar CPU/bateria tocando em loop e não distrai do form).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => {
      if (v.currentTime >= VIDEO_FREEZE_AT) {
        v.pause();
        v.currentTime = VIDEO_FREEZE_AT;
        v.removeEventListener("timeupdate", onTimeUpdate);
      }
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, []);

  useEffect(() => {
    if (hydrated && session) router.replace("/dashboard");
  }, [hydrated, session, router]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { login: "", senha: "" },
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

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const next = await authService.login(values);
      if (lembrar) {
        window.localStorage.setItem(REMEMBER_KEY, values.login.trim());
      } else {
        window.localStorage.removeItem(REMEMBER_KEY);
      }
      setSession(next);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
          (err instanceof Error ? err.message : "Não foi possível autenticar. Verifique suas credenciais.")
      );
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-x-hidden text-brand-ice">
      {/* Vídeo de fundo — toca até 6s e congela nesse frame (vira poster estático) */}
      <video
        ref={videoRef}
        src={asset("/login_app.mp4")}
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden
        className="absolute inset-0 z-0 h-full w-full scale-[1.02] select-none object-cover"
        style={{ filter: "blur(5px)" }}
        onError={(e) => {
          // Sem vídeo (rede fraca no cold-start) — cai pra imagem estática antiga.
          (e.currentTarget as HTMLVideoElement).style.display = "none";
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset("/imagem_login.png")}
        alt=""
        aria-hidden
        className="absolute inset-0 -z-10 h-full w-full select-none object-cover"
        draggable={false}
      />
      {/* Overlay escuro — por cima do blur, pra manter contraste do formulário */}
      <div
        aria-hidden
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,59,76,0.55) 0%, rgba(7,59,76,0.82) 60%, rgba(7,59,76,0.96) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-end px-4 pb-[max(env(safe-area-inset-bottom),10dvh)] md:min-h-[100dvh] md:justify-center md:py-16">
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
              Entre com suas credenciais GLPI para continuar
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
          </div>

          <label className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-white/70">
            <input
              type="checkbox"
              checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)}
              className="h-4 w-4 rounded border-white/30 bg-white/10 accent-brand-emerald"
            />
            Lembrar meu usuário
          </label>

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
            ) : (
              <>
                Entrar na plataforma
                <ArrowRight className="h-[18px] w-[18px]" />
              </>
            )}
          </button>
        </motion.form>
      </div>
    </main>
  );
}
