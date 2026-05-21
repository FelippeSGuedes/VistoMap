"use client";

/**
 * /painel/login — Central Operacional · Tela de acesso enterprise premium.
 * Dark glassmorphism sobre login_painel.png.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
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
      {/* CSS: placeholder + focus + bg responsivo retraído */}
      <style suppressHydrationWarning>{`
        .field-dark::placeholder { color: rgba(255,255,255,0.22); }
        .field-dark:focus { outline: none; }
        .input-wrap-focus { border-color: rgba(0,201,155,0.45) !important; box-shadow: 0 0 0 3px rgba(0,179,136,0.08), 0 1px 2px rgba(0,0,0,0.25) !important; }
        .btn-enter::before { content:""; position:absolute; inset:0; background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.07) 50%,transparent 60%); opacity:0; transition:opacity 0.25s; }
        .btn-enter:hover::before { opacity:1; }
        /* BG retraído — mostra mais da imagem (contain). Sem corte agressivo. */
        .painel-bg-img {
          object-fit: contain !important;
          object-position: center center !important;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: high-quality;
        }
        /* Mobile/portrait: cover (vertical não cabe em contain) */
        @media (max-width: 768px) {
          .painel-bg-img {
            object-fit: cover !important;
            object-position: center 35% !important;
          }
        }
      `}</style>

      <div
        className="relative flex min-h-[100dvh] overflow-hidden"
        style={{ background: "#02060F" }}
      >
        {/* BG full-screen — next/image otimiza WebP/AVIF + srcset por DPR */}
        <Image
          src="/login_painel.png"
          alt=""
          aria-hidden
          fill
          priority
          quality={95}
          sizes="100vw"
          className="painel-bg-img z-0"
          draggable={false}
        />
        {/* Global dark scrim */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: "rgba(2,6,23,0.42)" }}
        />

        {/* ───────── LEFT PANEL ───────── */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 0.7, 0.2, 1] }}
          className="relative z-10 flex h-[100dvh] w-full flex-col md:w-[360px] xl:w-[390px]"
          style={{
            background:
              "linear-gradient(160deg, rgba(2,6,23,0.97) 0%, rgba(2,6,23,0.88) 50%, rgba(2,6,23,0.62) 100%)",
            backdropFilter: "blur(28px) saturate(130%)",
            WebkitBackdropFilter: "blur(28px) saturate(130%)",
            borderRight: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {/* Ambient green glow — top */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(0,179,136,0.14) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          {/* Subtle grid texture */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
              backgroundSize: "52px 52px",
            }}
          />
          {/* Top highlight line */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent, rgba(0,179,136,0.3), transparent)",
            }}
          />

          {/* Inner layout */}
          <div className="relative flex flex-1 flex-col justify-between px-7 py-8 xl:px-9">

            {/* ── TOPO: Logo ── */}
            <motion.header
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
            >
              <div className="flex items-center gap-3">
                {/* Favicon container */}
                <div
                  className="flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-[13px]"
                  style={{
                    background:
                      "linear-gradient(145deg, rgba(0,179,136,0.2) 0%, rgba(0,135,95,0.12) 100%)",
                    border: "1px solid rgba(0,179,136,0.25)",
                    boxShadow:
                      "0 0 0 1px rgba(0,0,0,0.3), 0 4px 16px rgba(0,179,136,0.12)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo_favicon.PNG"
                    alt="VistoMap icon"
                    className="h-6 w-6 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </div>

                {/* Brand name */}
                <div>
                  <div className="flex items-baseline">
                    <span
                      className="text-[21px] font-semibold leading-none tracking-[-0.4px]"
                      style={{
                        color: "rgba(255,255,255,0.94)",
                        fontFamily: "'Inter', 'SF Pro Display', sans-serif",
                      }}
                    >
                      Visto
                    </span>
                    <span
                      className="text-[21px] font-semibold leading-none tracking-[-0.4px]"
                      style={{
                        color: "#00C99B",
                        fontFamily: "'Inter', 'SF Pro Display', sans-serif",
                      }}
                    >
                      Map
                    </span>
                  </div>
                  <p
                    className="mt-[3px] text-[9px] font-medium uppercase tracking-[0.22em]"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                  >
                    Central Operacional
                  </p>
                </div>
              </div>
            </motion.header>

            {/* ── MAIN: Título + Form ── */}
            <motion.main
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.55, ease: [0.22, 0.7, 0.2, 1] }}
              className="space-y-5"
            >
              {/* Título */}
              <div className="space-y-2">
                <h1
                  className="text-[22px] font-semibold leading-tight tracking-[-0.5px]"
                  style={{
                    color: "rgba(255,255,255,0.95)",
                    fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  Bem-vindo de volta
                </h1>
                <p
                  className="text-[12.5px] leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.38)" }}
                >
                  Acesse o painel operacional e gerencie vistorias, técnicos e
                  operações em campo.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-2.5">
                {/* Campo Usuário */}
                <div className="space-y-1.5">
                  <label
                    className="block text-[9px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                  >
                    Usuário
                  </label>
                  <div
                    className={`flex items-center gap-2.5 rounded-[11px] px-3.5 py-2.5 transition-all duration-200 ${focusUser ? "input-wrap-focus" : ""}`}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                    }}
                  >
                    <User
                      className="h-[15px] w-[15px] shrink-0"
                      style={{ color: focusUser ? "rgba(0,201,155,0.6)" : "rgba(255,255,255,0.22)" }}
                      strokeWidth={1.8}
                    />
                    <input
                      type="text"
                      autoComplete="username"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      onFocus={() => setFocusUser(true)}
                      onBlur={() => setFocusUser(false)}
                      placeholder="Digite seu usuário GLPI"
                      className="field-dark flex-1 bg-transparent text-[13px] font-medium"
                      style={{ color: "rgba(255,255,255,0.88)", caretColor: "#00C99B" }}
                      required
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div className="space-y-1.5">
                  <label
                    className="block text-[9px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                  >
                    Senha
                  </label>
                  <div
                    className={`flex items-center gap-2.5 rounded-[11px] px-3.5 py-2.5 transition-all duration-200 ${focusPwd ? "input-wrap-focus" : ""}`}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                    }}
                  >
                    <Lock
                      className="h-[15px] w-[15px] shrink-0"
                      style={{ color: focusPwd ? "rgba(0,201,155,0.6)" : "rgba(255,255,255,0.22)" }}
                      strokeWidth={1.8}
                    />
                    <input
                      type={showPwd ? "text" : "password"}
                      autoComplete="current-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      onFocus={() => setFocusPwd(true)}
                      onBlur={() => setFocusPwd(false)}
                      placeholder="Digite sua senha"
                      className="field-dark flex-1 bg-transparent text-[13px] font-medium"
                      style={{ color: "rgba(255,255,255,0.88)", caretColor: "#00C99B" }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="shrink-0 transition hover:opacity-70"
                      style={{ color: "rgba(255,255,255,0.22)" }}
                    >
                      {showPwd ? (
                        <EyeOff className="h-[15px] w-[15px]" strokeWidth={1.8} />
                      ) : (
                        <Eye className="h-[15px] w-[15px]" strokeWidth={1.8} />
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
                        className="rounded-[10px] px-3.5 py-2.5 text-[11.5px] font-medium"
                        style={{
                          background: "rgba(239,68,68,0.09)",
                          color: "#FCA5A5",
                          border: "1px solid rgba(239,68,68,0.18)",
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
                  whileHover={!loading ? { scale: 1.008 } : undefined}
                  whileTap={!loading ? { scale: 0.994 } : undefined}
                  className="btn-enter relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[11px] py-2.5 text-[13px] font-semibold tracking-[-0.1px] text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background:
                      "linear-gradient(135deg, #00C99B 0%, #00875F 100%)",
                    boxShadow:
                      "0 1px 0 rgba(255,255,255,0.18) inset, 0 8px 28px rgba(0,179,136,0.3), 0 2px 8px rgba(0,0,0,0.22)",
                  }}
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  ) : (
                    <>
                      <span>Entrar no Painel</span>
                      <ArrowRight className="h-[15px] w-[15px]" strokeWidth={2.3} />
                    </>
                  )}
                </motion.button>
              </form>

              {/* Auth badge */}
              <div
                className="flex items-center gap-2 rounded-[10px] px-3.5 py-2.5"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.055)",
                }}
              >
                <Lock
                  className="h-3 w-3 shrink-0"
                  style={{ color: "rgba(0,201,155,0.45)" }}
                  strokeWidth={1.8}
                />
                <p
                  className="text-[11px]"
                  style={{ color: "rgba(255,255,255,0.28)" }}
                >
                  Autenticação integrada com GLPI
                </p>
              </div>
            </motion.main>

            {/* ── RODAPÉ ── */}
            <motion.footer
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="space-y-3"
            >
              {/* Nansen */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[9.5px]"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  Desenvolvido por
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-marca.PNG"
                  alt="Nansen"
                  className="h-[14px] object-contain"
                  style={{ filter: "brightness(0) invert(1)", opacity: 0.3 }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              {/* Copyright */}
              <p
                className="text-[9px]"
                style={{ color: "rgba(255,255,255,0.14)" }}
              >
                © 2025 VistoMap. Todos os direitos reservados.
              </p>
            </motion.footer>
          </div>
        </motion.div>

        {/* RIGHT SIDE: transparent — shows bg */}
        <div className="relative z-[2] hidden flex-1 md:block" />
      </div>
    </>
  );
}
