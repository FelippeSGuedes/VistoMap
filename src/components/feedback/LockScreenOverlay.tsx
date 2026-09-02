"use client";

/**
 * LockScreenOverlay — trava diária local (Fase 3a/3b do build nativo Play
 * Store). Aparece uma vez por dia, mesmo com sessão de API ainda válida —
 * mesmo padrão de apps de banco: sessão continua ativa, mas exige
 * confirmação local pra reabrir.
 *
 * Biometria é SEMPRE a primeira tentativa quando disponível — dispara
 * sozinha assim que a trava aparece, sem precisar de toque extra. Só cai
 * pro formulário de senha depois de MAX_TENTATIVAS_BIOMETRIA falhas
 * seguidas (cancelou, não reconheceu o dedo, etc.) — aparelho sem
 * biometria cadastrada pula direto pra senha, como antes.
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
import { useAuthStore } from "@/store/auth";
import { authService } from "@/services/auth";
import {
  deriveAndStoreHash,
  hasLocalHash,
  isBiometricAvailable,
  markUnlockedToday,
  verifyBiometric,
  verifyPassword,
} from "@/services/lock";

const MAX_TENTATIVAS_BIOMETRIA = 3;

interface FormValues {
  senha: string;
}

export function LockScreenOverlay() {
  const locked = useLockStore((s) => s.locked);
  const unlock = useLockStore((s) => s.unlock);
  const otaPhase = useOtaStore((s) => s.phase);
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);

  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometriaDisponivel, setBiometriaDisponivel] = useState(false);
  const [verificandoBiometria, setVerificandoBiometria] = useState(false);
  const [tentativasBiometria, setTentativasBiometria] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { senha: "" } });

  // Reseta tudo a cada vez que a trava liga, e dispara a biometria sozinha
  // se o aparelho tiver — o técnico não precisa tocar em nada pra tentar.
  useEffect(() => {
    if (!locked) return;
    setError(null);
    setTentativasBiometria(0);
    reset({ senha: "" });

    let cancelado = false;
    isBiometricAvailable().then((disponivel) => {
      if (cancelado) return;
      setBiometriaDisponivel(disponivel);
      if (disponivel) void tentarBiometria();
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, reset]);

  async function tentarBiometria() {
    setVerificandoBiometria(true);
    setError(null);
    try {
      const ok = await verifyBiometric();
      if (ok) {
        markUnlockedToday();
        unlock();
        return;
      }
      setTentativasBiometria((n) => n + 1);
    } finally {
      setVerificandoBiometria(false);
    }
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);

    if (hasLocalHash()) {
      const ok = await verifyPassword(values.senha);
      if (!ok) {
        setError("Senha incorreta.");
        return;
      }
    } else {
      // Sessão de ANTES da trava diária existir (ou primeiro login neste
      // aparelho) — ainda não tem hash local pra comparar. Confirma contra
      // o mesmo endpoint da tela de login (é o único jeito de validar a
      // senha sem tê-la guardado em texto puro) e semeia o hash local a
      // partir daqui; da próxima vez cai no caminho rápido acima.
      if (!session) {
        setError("Sessão expirada — faça login novamente.");
        return;
      }
      try {
        const next = await authService.login({ login: session.tecnico.email, senha: values.senha });
        await deriveAndStoreHash(values.senha);
        setSession(next);
      } catch (err) {
        const semResposta = !(err as { response?: unknown })?.response;
        setError(
          semResposta
            ? "Sem conexão — não foi possível confirmar agora. Tente novamente."
            : "Senha incorreta."
        );
        return;
      }
    }

    markUnlockedToday();
    unlock();
  };

  // Evita as duas telas cheias brigando pela tela ao mesmo tempo.
  const cedePraOta = otaPhase === "baixando" || otaPhase === "aplicando";
  const visivel = locked && !cedePraOta;

  // Fica na fase de biometria enquanto ela estiver disponível e não tiver
  // estourado o limite de tentativas — só então libera o formulário de senha.
  const faseBiometria = biometriaDisponivel && tentativasBiometria < MAX_TENTATIVAS_BIOMETRIA;
  const chegouViaFalhaBiometria = !biometriaDisponivel ? false : tentativasBiometria >= MAX_TENTATIVAS_BIOMETRIA;

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
          <AnimatePresence mode="wait">
            {faseBiometria ? (
              <motion.div
                key="biometria"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.22, 0.7, 0.2, 1] }}
                className="flex w-full max-w-[360px] flex-col items-center"
              >
                <button
                  type="button"
                  onClick={() => void tentarBiometria()}
                  disabled={verificandoBiometria}
                  aria-label="Tentar biometria novamente"
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald ring-1 ring-brand-emerald/30 transition active:scale-[0.97] disabled:cursor-not-allowed"
                >
                  {verificandoBiometria ? (
                    <Loader2 className="h-10 w-10 animate-spin" strokeWidth={1.8} />
                  ) : (
                    <Fingerprint className="h-11 w-11" strokeWidth={1.8} />
                  )}
                </button>

                <h1 className="mt-5 text-center text-[16px] font-semibold tracking-tight text-white">
                  Confirme por biometria
                </h1>
                <p className="mt-1 text-center text-[11.5px] font-medium text-white/60">
                  Verificação diária de segurança — use sua digital ou rosto
                </p>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 w-full rounded-2xl border border-red-300/40 bg-red-500/12 px-3 py-2 text-center text-[13px] text-red-100"
                  >
                    {error}
                  </motion.div>
                )}

                {tentativasBiometria > 0 && (
                  <p className="mt-4 text-center text-[11px] text-white/45">
                    Não reconhecemos — tentativa {tentativasBiometria} de {MAX_TENTATIVAS_BIOMETRIA}
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.form
                key="senha"
                onSubmit={handleSubmit(onSubmit)}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 0.7, 0.2, 1] }}
                className="flex w-full max-w-[360px] flex-col items-center"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald ring-1 ring-brand-emerald/30">
                  <ShieldCheck className="h-7 w-7" strokeWidth={2} />
                </span>

                <h1 className="mt-4 text-center text-[16px] font-semibold tracking-tight text-white">
                  Confirme sua identidade
                </h1>
                <p className="mt-1 text-center text-[11.5px] font-medium text-white/60">
                  {chegouViaFalhaBiometria
                    ? "Não conseguimos confirmar por biometria — digite sua senha"
                    : "Verificação diária de segurança — digite sua senha para continuar"}
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
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
