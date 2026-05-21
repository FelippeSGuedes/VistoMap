"use client";

/**
 * /painel/login — Central Operacional · Tela de acesso enterprise.
 *
 * Hero image cobre toda viewport (cover, sem bordas vazias). Sidebar de
 * autenticação flutuante à esquerda em desktop; full-width em mobile.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck, User } from "lucide-react";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

export default function PainelLoginPage() {
  const router = useRouter();
  const { hydrated, session, setSession } = useAuthStore();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusUser, setFocusUser] = useState(false);
  const [focusPwd, setFocusPwd] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (session?.role === "admin") router.replace("/painel");
  }, [hydrated, session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !senha) return;
    setError(null);
    setLoading(true);
    try {
      const result = await authService.login({ login, senha });
      if (result.role !== "admin") {
        setError("Esta conta não tem acesso ao painel. Use o app do técnico em /login.");
        setLoading(false);
        return;
      }
      setSession(result);
      router.replace("/painel");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Falha na autenticação. Verifique suas credenciais.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <>
      <style suppressHydrationWarning>{`
        .field-dark::placeholder { color: rgba(255,255,255,0.26); }
        .field-dark:focus { outline: none; }
        .input-shell {
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 1px 2px rgba(0,0,0,0.18), 0 0 0 0 rgba(0,201,155,0);
          transition: border-color 220ms, box-shadow 220ms, background 220ms;
        }
        .input-shell.is-focused {
          background: rgba(255,255,255,0.05);
          border-color: rgba(0,201,155,0.55);
          box-shadow: 0 1px 2px rgba(0,0,0,0.22), 0 0 0 4px rgba(0,179,136,0.10);
        }
        .btn-primary { position: relative; overflow: hidden; }
        .btn-primary::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.16) 50%, transparent 62%);
          transform: translateX(-100%);
          transition: transform 700ms cubic-bezier(.22,.7,.2,1);
        }
        .btn-primary:hover::after { transform: translateX(100%); }
      `}</style>

      <div
        className="relative flex min-h-[100dvh] overflow-hidden"
        style={{ background: "#02060F" }}
      >
        {/* ─────── BG hero (cover, sem bordas) ─────── */}
        <Image
          src="/login_painel.png"
          alt=""
          aria-hidden
          fill
          priority
          quality={92}
          sizes="100vw"
          className="z-0 select-none"
          style={{
            objectFit: "cover",
            objectPosition: "center center",
          }}
          draggable={false}
        />

        {/* Scrim cinematográfico: sombra esquerda forte → centro/dir mais claro */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(90deg, rgba(2,6,15,0.92) 0%, rgba(2,6,15,0.78) 22%, rgba(2,6,15,0.38) 55%, rgba(2,6,15,0.20) 100%)",
          }}
        />
        {/* Vinheta sutil bordas */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)",
          }}
        />

        {/* ─────── SIDEBAR FORM ─────── */}
        <div className="relative z-10 flex w-full items-center justify-start md:px-10 lg:px-16">
          <motion.section
            initial={{ opacity: 0, x: -28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.7, 0.2, 1] }}
            className="relative flex h-[100dvh] w-full flex-col md:h-auto md:w-[440px] md:rounded-[22px] xl:w-[460px]"
            style={{
              background:
                "linear-gradient(170deg, rgba(8,14,28,0.86) 0%, rgba(4,9,20,0.82) 60%, rgba(4,9,20,0.78) 100%)",
              backdropFilter: "blur(36px) saturate(140%)",
              WebkitBackdropFilter: "blur(36px) saturate(140%)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow:
                "0 24px 60px -12px rgba(0,0,0,0.5), 0 8px 20px -8px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.02) inset",
            }}
          >
            {/* glow esmeralda topo */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(0,179,136,0.22) 0%, transparent 70%)",
                filter: "blur(48px)",
              }}
            />
            {/* highlight line topo */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, rgba(0,179,136,0.55), transparent)",
              }}
            />
            {/* grid sutil */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
                backgroundSize: "56px 56px",
              }}
            />

            <div className="relative flex flex-1 flex-col justify-between px-8 py-10 md:px-10 md:py-12 xl:px-12">
              {/* ─── BRAND ─── */}
              <motion.header
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.55 }}
                className="flex items-center gap-3.5"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px]"
                  style={{
                    background:
                      "linear-gradient(145deg, rgba(0,201,155,0.22) 0%, rgba(0,135,95,0.10) 100%)",
                    border: "1px solid rgba(0,201,155,0.32)",
                    boxShadow:
                      "0 0 0 1px rgba(0,0,0,0.3), 0 6px 22px rgba(0,179,136,0.18), 0 1px 0 rgba(255,255,255,0.06) inset",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo_favicon.PNG"
                    alt=""
                    className="h-7 w-7 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-baseline gap-px">
                    <span
                      className="text-[24px] font-semibold leading-none tracking-[-0.5px]"
                      style={{
                        color: "rgba(255,255,255,0.96)",
                        fontFamily: "'Inter', 'SF Pro Display', sans-serif",
                      }}
                    >
                      Visto
                    </span>
                    <span
                      className="text-[24px] font-semibold leading-none tracking-[-0.5px]"
                      style={{
                        color: "#00C99B",
                        fontFamily: "'Inter', 'SF Pro Display', sans-serif",
                      }}
                    >
                      Map
                    </span>
                  </div>
                  <p
                    className="mt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.24em]"
                    style={{ color: "rgba(0,201,155,0.62)" }}
                  >
                    Central Operacional
                  </p>
                </div>
              </motion.header>

              {/* ─── MAIN ─── */}
              <motion.main
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.6, ease: [0.22, 0.7, 0.2, 1] }}
                className="my-10 space-y-7"
              >
                {/* Título */}
                <div className="space-y-2.5">
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                    style={{
                      background: "rgba(0,201,155,0.10)",
                      border: "1px solid rgba(0,201,155,0.22)",
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: "#00C99B",
                        boxShadow: "0 0 8px rgba(0,201,155,0.7)",
                      }}
                    />
                    <span
                      className="text-[9.5px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "rgba(0,201,155,0.9)" }}
                    >
                      Acesso restrito
                    </span>
                  </div>
                  <h1
                    className="text-[28px] font-semibold leading-[1.1] tracking-[-0.6px]"
                    style={{
                      color: "rgba(255,255,255,0.98)",
                      fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    Bem-vindo de
                    <br />
                    <span style={{ color: "#00C99B" }}>volta.</span>
                  </h1>
                  <p
                    className="text-[13px] leading-[1.55]"
                    style={{ color: "rgba(255,255,255,0.46)" }}
                  >
                    Entre com sua conta GLPI para gerenciar vistorias,
                    técnicos e a operação em campo.
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  {/* Usuário */}
                  <div className="space-y-1.5">
                    <label
                      className="block text-[9.5px] font-semibold uppercase tracking-[0.2em]"
                      style={{ color: "rgba(255,255,255,0.42)" }}
                    >
                      Usuário GLPI
                    </label>
                    <div
                      className={`input-shell flex items-center gap-3 rounded-[12px] px-4 py-3.5 ${focusUser ? "is-focused" : ""}`}
                    >
                      <User
                        className="h-[17px] w-[17px] shrink-0"
                        style={{
                          color: focusUser
                            ? "rgba(0,201,155,0.85)"
                            : "rgba(255,255,255,0.32)",
                        }}
                        strokeWidth={1.9}
                      />
                      <input
                        type="text"
                        autoComplete="username"
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        onFocus={() => setFocusUser(true)}
                        onBlur={() => setFocusUser(false)}
                        placeholder="seu.usuario"
                        className="field-dark flex-1 bg-transparent text-[14px] font-medium tracking-[-0.1px]"
                        style={{
                          color: "rgba(255,255,255,0.95)",
                          caretColor: "#00C99B",
                        }}
                        required
                      />
                    </div>
                  </div>

                  {/* Senha */}
                  <div className="space-y-1.5">
                    <label
                      className="block text-[9.5px] font-semibold uppercase tracking-[0.2em]"
                      style={{ color: "rgba(255,255,255,0.42)" }}
                    >
                      Senha
                    </label>
                    <div
                      className={`input-shell flex items-center gap-3 rounded-[12px] px-4 py-3.5 ${focusPwd ? "is-focused" : ""}`}
                    >
                      <Lock
                        className="h-[17px] w-[17px] shrink-0"
                        style={{
                          color: focusPwd
                            ? "rgba(0,201,155,0.85)"
                            : "rgba(255,255,255,0.32)",
                        }}
                        strokeWidth={1.9}
                      />
                      <input
                        type={showPwd ? "text" : "password"}
                        autoComplete="current-password"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        onFocus={() => setFocusPwd(true)}
                        onBlur={() => setFocusPwd(false)}
                        placeholder="••••••••"
                        className="field-dark flex-1 bg-transparent text-[14px] font-medium tracking-[-0.1px]"
                        style={{
                          color: "rgba(255,255,255,0.95)",
                          caretColor: "#00C99B",
                          letterSpacing: showPwd ? "-0.1px" : "0.18em",
                        }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(!showPwd)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition hover:bg-white/[0.06]"
                        style={{ color: "rgba(255,255,255,0.42)" }}
                        aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPwd ? (
                          <EyeOff className="h-[15px] w-[15px]" strokeWidth={1.9} />
                        ) : (
                          <Eye className="h-[15px] w-[15px]" strokeWidth={1.9} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Erro */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        className="overflow-hidden"
                      >
                        <p
                          className="rounded-[11px] px-4 py-3 text-[12px] font-medium leading-[1.45]"
                          style={{
                            background: "rgba(239,68,68,0.10)",
                            color: "#FCA5A5",
                            border: "1px solid rgba(239,68,68,0.22)",
                          }}
                        >
                          {error}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Botão */}
                  <motion.button
                    type="submit"
                    disabled={loading || !login || !senha}
                    whileHover={!loading ? { scale: 1.01 } : undefined}
                    whileTap={!loading ? { scale: 0.992 } : undefined}
                    className="btn-primary mt-1.5 flex w-full items-center justify-center gap-2.5 rounded-[12px] py-3.5 text-[14px] font-semibold tracking-[-0.15px] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                    style={{
                      background:
                        "linear-gradient(135deg, #00D6A6 0%, #00B388 50%, #00875F 100%)",
                      boxShadow:
                        "0 1px 0 rgba(255,255,255,0.22) inset, 0 12px 32px -6px rgba(0,179,136,0.42), 0 4px 12px -2px rgba(0,0,0,0.28)",
                    }}
                  >
                    {loading ? (
                      <div className="h-[18px] w-[18px] animate-spin rounded-full border-[2.4px] border-white/30 border-t-white" />
                    ) : (
                      <>
                        <span>Entrar no Painel</span>
                        <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
                      </>
                    )}
                  </motion.button>
                </form>

                {/* Auth badge */}
                <div
                  className="flex items-center gap-2.5 rounded-[11px] px-3.5 py-2.5"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <ShieldCheck
                    className="h-[14px] w-[14px] shrink-0"
                    style={{ color: "rgba(0,201,155,0.7)" }}
                    strokeWidth={2}
                  />
                  <p
                    className="text-[11.5px] leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    Autenticação integrada e auditada via GLPI
                  </p>
                </div>
              </motion.main>

              {/* ─── FOOTER ─── */}
              <motion.footer
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="flex items-end justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                  >
                    Desenvolvido por
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-marca.PNG"
                    alt="Nansen"
                    className="h-[15px] object-contain"
                    style={{ filter: "brightness(0) invert(1)", opacity: 0.38 }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <p
                  className="text-[9.5px] font-medium"
                  style={{ color: "rgba(255,255,255,0.22)" }}
                >
                  © 2025 VistoMap
                </p>
              </motion.footer>
            </div>
          </motion.section>
        </div>
      </div>
    </>
  );
}
