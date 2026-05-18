"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { PostesProximosPanel } from "./PostesProximosPanel";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePostesProximos } from "@/hooks/usePostesProximos";
import { cn } from "@/utils/cn";
import {
  MOTIVOS_MUDANCA,
  MOTIVO_LABEL,
  type MotivoMudanca,
  type MudancaPosteResponse,
  type Poste,
} from "@/types";
import { registrarMudancaPoste } from "@/services/postes";

const MapView = dynamic(
  () => import("@/components/vistorias/MapView").then((m) => m.MapView),
  { ssr: false }
);

type Step = "motivo" | "picker" | "confirmar" | "saving";

interface MudarPosteFlowProps {
  open: boolean;
  onClose: () => void;
  vistoriaId: string;
  psposteAntigo: string;
  municipioAntigo: string;
  /** Lat/Lng do poste antigo — usado pra centralizar mapa + validar raio server-side. */
  latAtual: number;
  lngAtual: number;
  onApplied: (response: MudancaPosteResponse) => void;
}

const MOTIVO_DESC: Record<MotivoMudanca, string> = {
  POSTE_INACESSIVEL: "Não há rota segura/possível até o poste",
  VEGETACAO_BLOQUEANDO: "Mato, galhos ou árvores cobrindo o equipamento",
  POSTE_INEXISTENTE: "Poste cadastrado não foi encontrado no campo",
  ENDERECO_INCORRETO: "Coordenada/endereço no GLPI está errado",
  POSTE_DANIFICADO: "Poste presente mas com avaria estrutural",
  AREA_DE_RISCO: "Local oferece risco ao técnico",
  OUTRO: "Especifique manualmente na observação",
};

export function MudarPosteFlow({
  open,
  onClose,
  vistoriaId,
  psposteAntigo,
  municipioAntigo,
  latAtual,
  lngAtual,
  onApplied,
}: MudarPosteFlowProps) {
  const [step, setStep] = useState<Step>("motivo");
  const [motivo, setMotivo] = useState<MotivoMudanca | null>(null);
  const [observacao, setObservacao] = useState("");
  const [posteNovo, setPosteNovo] = useState<Poste | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const geo = useGeolocation(false);
  const postes = usePostesProximos();

  // reset ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setStep("motivo");
      setMotivo(null);
      setObservacao("");
      setPosteNovo(null);
      setSubmitError(null);
      postes.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Ao entrar no picker: tenta GPS primeiro (mais confiável que coord do GLPI).
  // Se GPS já estiver disponível, usa-o; senão, usa lat/lng do vistoria como fallback.
  useEffect(() => {
    if (step !== "picker") return;
    if (postes.fetched) return;
    const run = async () => {
      const fresh = geo.position ?? (await geo.refresh());
      const lat = fresh?.lat ?? latAtual;
      const lng = fresh?.lng ?? lngAtual;
      await postes.fetch({ lat, lng, raio: 500, limit: 80 });
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const motivoValid =
    motivo != null && (motivo !== "OUTRO" || observacao.trim().length >= 4);

  const handleConfirmar = async () => {
    if (!motivo || !posteNovo) return;
    setStep("saving");
    setSubmitError(null);
    try {
      const response = await registrarMudancaPoste({
        vistoria_id: vistoriaId,
        lat_antiga: latAtual,
        lng_antiga: lngAtual,
        psposte_antigo: psposteAntigo || null,
        municipio_antigo: municipioAntigo || null,
        poste_id_novo: posteNovo.id,
        motivo,
        observacao: observacao.trim() || null,
      });
      onApplied(response);
      onClose();
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { message?: string; error?: string } };
      };
      setSubmitError(
        e.response?.data?.message ??
          (err instanceof Error ? err.message : "Falha ao registrar mudança")
      );
      setStep("confirmar");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[220] flex items-stretch justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-brand-deep/45 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 flex h-[100dvh] w-full flex-col bg-brand-ice md:my-6 md:h-[calc(100dvh-48px)] md:max-w-2xl md:rounded-3xl md:shadow-elev"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <FlowHeader
              step={step}
              psposteAntigo={psposteAntigo}
              onBack={() => {
                if (step === "picker") setStep("motivo");
                else if (step === "confirmar") setStep("picker");
                else onClose();
              }}
              onClose={onClose}
            />

            {/* CONTEÚDO */}
            <div className="relative flex-1 overflow-hidden">
              {step === "motivo" && (
                <MotivoStep
                  motivo={motivo}
                  observacao={observacao}
                  onMotivo={setMotivo}
                  onObservacao={setObservacao}
                />
              )}

              {step === "picker" && (
                <PickerStep
                  postes={postes.items}
                  loading={postes.loading}
                  userPos={
                    geo.position
                      ? { lat: geo.position.lat, lng: geo.position.lng }
                      : null
                  }
                  centerOnVistoria={{ lat: latAtual, lng: lngAtual }}
                  selectedId={posteNovo?.id ?? null}
                  onSelect={(id) => {
                    const p = postes.items.find((x) => x.id === id) ?? null;
                    setPosteNovo(p);
                  }}
                  onAtribuir={() => setStep("confirmar")}
                />
              )}

              {(step === "confirmar" || step === "saving") && posteNovo && motivo && (
                <ConfirmarStep
                  psposteAntigo={psposteAntigo}
                  municipioAntigo={municipioAntigo}
                  posteNovo={posteNovo}
                  motivo={motivo}
                  observacao={observacao}
                  saving={step === "saving"}
                  error={submitError}
                />
              )}
            </div>

            {/* BOTTOM BAR */}
            <FlowFooter
              step={step}
              motivoValid={motivoValid}
              hasPosteNovo={!!posteNovo}
              onMotivoNext={() => setStep("picker")}
              onPickerNext={() => setStep("confirmar")}
              onConfirm={handleConfirmar}
              onCancel={onClose}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Header ──────────────────────────────────────────────────────────────── */

function FlowHeader({
  step,
  psposteAntigo,
  onBack,
  onClose,
}: {
  step: Step;
  psposteAntigo: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const titles: Record<Step, string> = {
    motivo: "Motivo da mudança",
    picker: "Selecione o poste correto",
    confirmar: "Confirmar mudança",
    saving: "Confirmar mudança",
  };
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-brand-steel/60 bg-white/95 px-4 py-3 backdrop-blur-xl pt-[max(env(safe-area-inset-top),12px)] md:rounded-t-3xl">
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-ink shadow-soft transition hover:bg-brand-ice"
        aria-label="Voltar"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-emerald">
          Mudar PSPOSTE
        </p>
        <h2 className="truncate text-[15px] font-semibold tracking-tight text-ink">
          {titles[step]}
        </h2>
        <p className="truncate text-[11px] text-ink-muted">
          Atual: <span className="font-medium text-ink">{psposteAntigo || "—"}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-steel/60 text-ink hover:bg-brand-steel"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  );
}

/* ─── Step 1: motivo ──────────────────────────────────────────────────────── */

function MotivoStep({
  motivo,
  observacao,
  onMotivo,
  onObservacao,
}: {
  motivo: MotivoMudanca | null;
  observacao: string;
  onMotivo: (m: MotivoMudanca) => void;
  onObservacao: (s: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <p className="mb-3 text-sm text-ink-muted">
        Por que esse poste precisa ser substituído?
      </p>
      <ul className="space-y-2">
        {MOTIVOS_MUDANCA.map((m) => {
          const active = motivo === m;
          return (
            <li key={m}>
              <button
                type="button"
                onClick={() => onMotivo(m)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left transition",
                  active
                    ? "border-brand-emerald ring-2 ring-brand-emerald/30 shadow-soft"
                    : "border-brand-steel/70 hover:border-brand-emerald/50"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    active
                      ? "border-brand-emerald bg-brand-emerald text-white"
                      : "border-brand-steel"
                  )}
                >
                  {active && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold tracking-tight text-ink">
                    {MOTIVO_LABEL[m]}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {MOTIVO_DESC[m]}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {motivo === "OUTRO" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3"
          >
            <Textarea
              label="Descreva o motivo *"
              placeholder="Mínimo 4 caracteres"
              value={observacao}
              onChange={(e) => onObservacao(e.target.value)}
              maxLength={1500}
              hint="Será anexado ao campo Descrição do GLPI"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Step 2: picker ──────────────────────────────────────────────────────── */

function PickerStep({
  postes,
  loading,
  userPos,
  centerOnVistoria,
  selectedId,
  onSelect,
  onAtribuir,
}: {
  postes: Poste[];
  loading: boolean;
  userPos: { lat: number; lng: number } | null;
  centerOnVistoria: { lat: number; lng: number };
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAtribuir: () => void;
}) {
  const focus = userPos ?? centerOnVistoria;
  const [panelOpen, setPanelOpen] = useState(true);
  const dummyVistorias = useMemo(() => [], []);

  const selected = useMemo(
    () => postes.find((p) => p.id === selectedId) ?? null,
    [postes, selectedId]
  );

  // UX: assim que o técnico escolhe um poste (no mapa OU na lista) recolhe o painel
  // pra liberar a área do botão "Atribuir Novo PSPOSTE".
  const handlePick = (id: number) => {
    onSelect(id);
    setPanelOpen(false);
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1">
        <MapView
          vistorias={dummyVistorias}
          userPosition={focus}
          postes={postes}
          selectedPosteId={selectedId}
          onPosteSelect={handlePick}
          className="h-full w-full"
        />

        {loading && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-ink shadow-soft backdrop-blur">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            Buscando postes…
          </div>
        )}

        {/* Pílula "Ver lista" — sempre acessível, abre o painel inferior */}
        <button
          type="button"
          onClick={() => setPanelOpen((s) => !s)}
          className="absolute right-3 top-3 z-20 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[12px] font-semibold text-brand-deep shadow-elev backdrop-blur"
        >
          <MapPin className="h-3.5 w-3.5" />
          {panelOpen ? "Ocultar lista" : `Lista (${postes.length})`}
        </button>

        {/* Card flutuante do poste selecionado — SEMPRE visível acima do painel */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="absolute inset-x-3 bottom-3 z-[95]"
            >
              <div className="overflow-hidden rounded-3xl border border-brand-emerald/40 bg-white shadow-elev">
                <div className="flex items-start gap-3 px-4 pb-2 pt-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-amber text-brand-deep">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-emerald">
                      Poste selecionado
                    </p>
                    <p className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-ink">
                      PSPOSTE {selected.pspostefield}
                    </p>
                    <p className="truncate text-[11px] text-ink-muted">
                      {selected.municipiofield}
                      {selected.materialfield ? ` · ${selected.materialfield}` : ""}
                      {selected.alturadaantenafield
                        ? ` · ${selected.alturadaantenafield}m`
                        : ""}
                      {selected.distancia_m != null
                        ? ` · ${Math.round(selected.distancia_m)}m`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="border-t border-brand-steel/60 bg-brand-ice/60 p-2">
                  <Button
                    fullWidth
                    size="lg"
                    leftIcon={<MapPin className="h-4 w-4" />}
                    onClick={onAtribuir}
                  >
                    Atribuir Novo PSPOSTE
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PostesProximosPanel
        open={panelOpen}
        loading={loading}
        origin={centerOnVistoria}
        raio={500}
        items={postes}
        selectedId={selectedId}
        onSelect={handlePick}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  );
}

/* ─── Step 3: confirmar ───────────────────────────────────────────────────── */

function ConfirmarStep({
  psposteAntigo,
  municipioAntigo,
  posteNovo,
  motivo,
  observacao,
  saving,
  error,
}: {
  psposteAntigo: string;
  municipioAntigo: string;
  posteNovo: Poste;
  motivo: MotivoMudanca;
  observacao: string;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="rounded-3xl border border-brand-amber/40 bg-brand-amber/10 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-amber text-brand-deep">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
              Confirme a mudança de poste
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink">
              Tem certeza que deseja mudar o Poste{" "}
              <strong>{psposteAntigo || "—"}</strong> do Município{" "}
              <strong>{municipioAntigo || "—"}</strong> para o PSPOSTE{" "}
              <strong>{posteNovo.pspostefield}</strong> do Município{" "}
              <strong>{posteNovo.municipiofield}</strong>?
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-brand-steel/70 bg-white p-3 text-xs">
        <div>
          <p className="font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Antigo
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink">
            {psposteAntigo || "—"}
          </p>
          <p className="text-ink-muted">{municipioAntigo || "—"}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-[0.14em] text-brand-emerald">
            Novo
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink">
            {posteNovo.pspostefield}
          </p>
          <p className="text-ink-muted">{posteNovo.municipiofield}</p>
          {posteNovo.materialfield && (
            <p className="mt-0.5 text-ink-muted">
              {posteNovo.materialfield}
              {posteNovo.alturadaantenafield
                ? ` · ${posteNovo.alturadaantenafield}m`
                : ""}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-brand-ice px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Motivo
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink">
          {MOTIVO_LABEL[motivo]}
        </p>
        {observacao.trim() && (
          <p className="mt-1 text-xs text-ink-muted">{observacao}</p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {saving && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-emerald/15 px-3 py-1.5 text-xs font-semibold text-brand-emerald">
          <Loader2 className="h-3 w-3 animate-spin" />
          Registrando mudança…
        </p>
      )}
    </div>
  );
}

/* ─── Footer (CTA por step) ───────────────────────────────────────────────── */

function FlowFooter({
  step,
  motivoValid,
  hasPosteNovo,
  onMotivoNext,
  onPickerNext,
  onConfirm,
  onCancel,
}: {
  step: Step;
  motivoValid: boolean;
  hasPosteNovo: boolean;
  onMotivoNext: () => void;
  onPickerNext: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <footer className="sticky bottom-0 z-10 border-t border-brand-steel/60 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl md:rounded-b-3xl">
      <div className="mx-auto flex w-full max-w-xl items-center gap-2">
        {step === "motivo" && (
          <Button
            fullWidth
            size="lg"
            disabled={!motivoValid}
            rightIcon={<ChevronRight className="h-4 w-4" />}
            onClick={onMotivoNext}
          >
            Continuar
          </Button>
        )}

        {step === "picker" && (
          <>
            <Button variant="outline" size="lg" onClick={onCancel}>
              Cancelar
            </Button>
            <div className="flex-1 text-center text-[11px] font-medium text-ink-muted">
              {hasPosteNovo
                ? "Confirme tocando no card acima"
                : "Toque num poste no mapa ou na lista"}
            </div>
          </>
        )}

        {step === "confirmar" && (
          <>
            <Button variant="outline" size="lg" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              fullWidth
              size="lg"
              leftIcon={<Check className="h-4 w-4" />}
              onClick={onConfirm}
            >
              Confirmar Mudança
            </Button>
          </>
        )}

        {step === "saving" && (
          <Button fullWidth size="lg" loading disabled>
            Registrando…
          </Button>
        )}
      </div>
    </footer>
  );
}

