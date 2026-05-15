"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Compass,
  Lock,
  MapPin,
  Navigation,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import type { LocationPermissionState } from "@/hooks/useLocationPermission";

interface LocationPermissionModalProps {
  open: boolean;
  state: LocationPermissionState;
  requesting?: boolean;
  error?: string | null;
  onAllow: () => void;
  onDismiss: () => void;
}

const COPY = {
  prompt: {
    eyebrow: "Localização necessária",
    title: "Ative seu GPS para começar",
    description:
      "Precisamos da sua localização atual para mostrar as vistorias mais próximas no mapa, calcular distância em tempo real e abrir rotas no Waze/Google Maps com um toque.",
    primary: "Permitir acesso",
    secondary: "Agora não",
    bullets: [
      { icon: MapPin, text: "Pins de vistoria próximas ao seu raio" },
      { icon: Compass, text: "Direção e distância em tempo real" },
      { icon: Navigation, text: "Navegação 1-toque pro local" },
    ],
  },
  denied: {
    eyebrow: "Permissão bloqueada",
    title: "Habilite manualmente nos ajustes",
    description:
      "Você bloqueou o acesso à localização. Para reativar, abra as permissões do navegador para este site e selecione \"Permitir\" para Localização.",
    primary: "Tentar novamente",
    secondary: "Continuar sem GPS",
    bullets: [
      {
        icon: Settings,
        text: "iOS Safari: aaA na barra → Ajustes do Site → Localização → Permitir",
      },
      {
        icon: Settings,
        text: "Android Chrome: ⋮ → Configurações do site → Localização → Permitir",
      },
    ],
  },
  unsupported: {
    eyebrow: "Dispositivo sem GPS",
    title: "Geolocalização indisponível",
    description:
      "Seu navegador ou dispositivo não suporta geolocalização. Você pode continuar usando o app, mas distâncias e rotas não estarão disponíveis.",
    primary: "Entendi",
    secondary: null,
    bullets: [],
  },
  insecure: {
    eyebrow: "Conexão não segura",
    title: "Acesse via HTTPS para liberar o GPS",
    description:
      "Navegadores móveis só liberam a localização em conexões seguras (HTTPS). Você está acessando por HTTP, então o prompt nativo não pode aparecer.",
    primary: "Entendi",
    secondary: "Continuar sem GPS",
    bullets: [
      {
        icon: Lock,
        text: "Troque a URL para https:// (ex.: https://vistomap.empresa.com)",
      },
      {
        icon: Settings,
        text: "Em dev, use localhost ou ngrok/cloudflared para túnel HTTPS",
      },
      {
        icon: ShieldCheck,
        text: "Em produção, configure um proxy reverso com certificado SSL",
      },
    ],
  },
} as const;

export function LocationPermissionModal({
  open,
  state,
  requesting,
  error,
  onAllow,
  onDismiss,
}: LocationPermissionModalProps) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const variant: keyof typeof COPY =
    state === "insecure"
      ? "insecure"
      : state === "denied"
      ? "denied"
      : state === "unsupported"
      ? "unsupported"
      : "prompt";
  const copy = COPY[variant];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[180] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-brand-deep/45 backdrop-blur-sm"
            onClick={onDismiss}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),16px)] shadow-elev sm:rounded-3xl"
          >
            {/* Hero with animated pin */}
            <div className="relative h-44 overflow-hidden bg-grad-deep">
              <div
                aria-hidden
                className="absolute inset-0 [background:radial-gradient(60%_80%_at_50%_30%,rgba(6,214,160,0.45),rgba(6,214,160,0))]"
              />
              <PinAnim />
              <button
                type="button"
                onClick={onDismiss}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur">
                <Sparkles className="h-3 w-3" />
                {copy.eyebrow}
              </div>
            </div>

            <div className="px-5 pt-4">
              <h2 className="text-[18px] font-semibold tracking-tight text-ink">
                {copy.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {copy.description}
              </p>

              {copy.bullets.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {copy.bullets.map((b, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i + 0.1 }}
                      className="flex items-start gap-2.5 rounded-2xl bg-brand-ice px-3 py-2.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-brand-emerald shadow-soft">
                        <b.icon className="h-4 w-4" />
                      </span>
                      <span className="pt-1 text-[13px] font-medium text-ink">
                        {b.text}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}

              {error && state !== "denied" && (
                <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {error}
                </p>
              )}

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-medium text-ink-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-emerald" />
                Usamos sua localização apenas durante a vistoria
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 px-5">
              <Button
                fullWidth
                size="xl"
                loading={requesting}
                leftIcon={<MapPin className="h-4 w-4" />}
                onClick={onAllow}
              >
                {copy.primary}
              </Button>
              {copy.secondary && (
                <Button
                  fullWidth
                  variant="ghost"
                  size="md"
                  onClick={onDismiss}
                >
                  {copy.secondary}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PinAnim() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {/* Pulse rings */}
      {[0, 0.5, 1].map((delay) => (
        <motion.span
          key={delay}
          className="absolute h-16 w-16 rounded-full border-2 border-brand-emerald"
          initial={{ scale: 0.6, opacity: 0.6 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{
            duration: 2.2,
            delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
      {/* Center pin */}
      <motion.div
        initial={{ y: -8 }}
        animate={{ y: 0 }}
        transition={{
          duration: 1.4,
          repeat: Infinity,
          repeatType: "reverse",
          ease: "easeInOut",
        }}
        className="relative flex h-16 w-16 items-center justify-center rounded-full bg-grad-emerald shadow-glow"
      >
        <MapPin className="h-7 w-7 text-white" strokeWidth={2.5} />
      </motion.div>
    </div>
  );
}
