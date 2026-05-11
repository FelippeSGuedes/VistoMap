"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

interface FormValues {
  email: string;
  senha: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setSession, hydrated, session } = useAuthStore();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && session) router.replace("/dashboard");
  }, [hydrated, session, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { email: "", senha: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const next = await authService.login(values);
      setSession(next);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nao foi possivel autenticar. Verifique suas credenciais."
      );
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#073B4C] text-brand-ice">
      {/* logo_app.png como fundo full-screen — mobile only */}
      <img
        src="/logo_app.png"
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover object-top md:hidden"
      />

      {/* Gradientes decorativos — desktop only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden opacity-[0.07] md:block [background-image:radial-gradient(circle_at_25%_18%,rgba(255,255,255,0.6)_0%,rgba(255,255,255,0)_50%),radial-gradient(circle_at_82%_72%,rgba(6,214,160,0.55)_0%,rgba(6,214,160,0)_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden opacity-[0.18] md:block"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 0%,rgba(6,214,160,0.10) 0%,rgba(6,214,160,0) 60%),repeating-radial-gradient(circle at 50% 35%,rgba(248,249,250,0.05) 0px,rgba(248,249,250,0.05) 1px,transparent 2px,transparent 90px)",
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
              Entre com suas credenciais para continuar
            </p>
          </header>

          <div className="mt-2 space-y-1.5">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                E-mail
              </label>
              <div className="group mt-0.5 flex h-[38px] items-center gap-2.5 rounded-[9px] border border-white/12 bg-white/[0.04] px-3 transition focus-within:border-brand-emerald/70 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(6,214,160,0.12)]">
                <Mail className="h-[13px] w-[13px] shrink-0 text-white/45 transition group-focus-within:text-brand-emerald" />
                <input
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
                  {...register("email", {
                    required: "Informe seu e-mail",
                    pattern: {
                      value: /^[\w.+-]+@[\w-]+\.[\w.-]+$/,
                      message: "E-mail invalido",
                    },
                  })}
                />
              </div>
              {errors.email?.message && (
                <span className="mt-1.5 block text-xs text-red-200">
                  {errors.email.message}
                </span>
              )}
            </div>

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

          <div className="mt-1.5 flex items-center justify-between gap-4 text-[10px] font-medium">
            <label className="inline-flex select-none items-center gap-2 text-white/70">
              <input
                type="checkbox"
                className="h-[15px] w-[15px] rounded border-white/25 bg-white/5 accent-brand-emerald"
              />
              Lembrar de mim
            </label>
            <button
              type="button"
              className="font-semibold text-brand-emerald transition hover:text-white"
            >
              Esqueci minha senha
            </button>
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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4c-7 0-13.1 4-16.1 9.9z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9 39.9 15.9 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C39.5 36.6 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
