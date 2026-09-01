"use client";

/**
 * LockScreenOverlay — trava diária local (Fase 3a do build nativo Play
 * Store). Aparece uma vez por dia, mesmo com sessão de API ainda válida —
 * mesmo padrão de apps de banco: sessão continua ativa, mas exige
 * confirmação local pra reabrir. Modelada visualmente como irmã da tela de
 * login (LoginPage), não como algo inventado do zero.
 *
 * Cede a tela pro OtaUpdateOverlay enquanto uma atualização está
 * baixando/aplicando (a WebView tá prestes a recarregar de qualquer
 * jeito) — some e volta a aparecer sozinha depois.
 */

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Fingerprint, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useLockStore } from "@/store/lock";
import { useOtaStore } from "@/store/ota";
import {
  isBiometricAvailable,
  markUnlockedToday,
  verifyBiometric,
  verifyPassword,
} from "@/services/lock";

interface FormValues {
  senha: string;
}

export function LockScreenOverlay() {
  const locked = useLockStore((s) => s.locked);
  const unlock = useLockStore((s) => s.unlock);
  const otaPhase = useOtaStore((s) => s.phase);

  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometriaDisponivel, setBiometriaDisponivel] = useState(false);
  const [verificandoBiometria, setVerificandoBiometria] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { senha: "" } });

  useEffect(() => {
    if (!locked) return;
    setError(null);
    reset({ senha: "" });
    isBiometricAvailable().then(setBiometriaDisponivel);
  }, [locked, reset]);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const ok = await verifyPassword(values.senha);
    if (!ok) {
      setError("Senha incorreta.");
      return;
    }
    markUnlockedToday();
    unlock();
  };

  async function tentarBiometria() {
    setVerificandoBiometria(true);
    try {
      const ok = await verifyBiometric();
      if (ok) {
        markUnlockedToday();
        unlock();
      }
    } finally {
      setVerificandoBiometria(false);
    }
  }

  // Evita as duas telas cheias brigando pela tela ao mesmo tempo.
  const cedePraOta = otaPhase === "baixando" || otaPhase === "aplicando";
  const visivel = locked && !cedePraOta;

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
          key="lock-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[210] flex flex-col items-center justify-center px-4 text-brand-ice"
          style={{
            background:
              "linear-gradient(180deg, rgba(7,59,76,0.97) 0%, rgba(5,40,52,0.99) 60%, rgba(3,26,34,1) 100%)",
          }}
        >
          <motion.form
            onSubmit={handleSubmit(onSubmit)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 0.7, 0.2, 1], delay: 0.05 }}
            className="flex w-full max-w-[360px] flex-col items-center"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald ring-1 ring-brand-emerald/30">
              <ShieldCheck className="h-7 w-7" strokeWidth={2} />
            </span>

            <h1 className="mt-4 text-center text-[16px] font-semibold tracking-tight text-white">
              Confirme sua identidade
            </h1>
            <p className="mt-1 text-center text-[11.5px] font-medium text-white/60">
              Verificação diária de segurança — digite sua senha para continuar
            </p>

            <div className="mt-5 w-full">
              <div className="group flex h-[42px] items-center gap-2.5 rounded-[9px] border border-white/12 bg-white/[0.04] px-3 transition focus-within:border-brand-emerald/70 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(6,214,160,0.12)]">
                <Lock className="h-[13px] w-[13px] shrink-0 text-white/45 transition group-focus-within:text-brand-emerald" />
                <input
                  type={show ? "text" : "password"}
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  autoFocus
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
                  {...register("senha", { required: true })}
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
              {errors.senha && (
                <span className="mt-1.5 block text-xs text-red-200">Informe sua senha</span>
              )}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 w-full rounded-2xl border border-red-300/40 bg-red-500/12 px-3 py-2 text-center text-[13px] text-red-100"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex h-[40px] w-full items-center justify-center gap-2 rounded-[9px] bg-brand-emerald px-5 text-[15px] font-bold tracking-tight text-[#073B4C] shadow-[0_14px_36px_rgba(6,214,160,0.30),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-brand-emerald/40 transition hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desbloquear"}
            </button>

            {biometriaDisponivel && (
              <button
                type="button"
                onClick={tentarBiometria}
                disabled={verificandoBiometria}
                className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-white/65 transition hover:text-white disabled:opacity-60"
              >
                {verificandoBiometria ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Fingerprint className="h-3.5 w-3.5" />
                )}
                Usar biometria
              </button>
            )}
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
