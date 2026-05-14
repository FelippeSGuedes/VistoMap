"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Antenna,
  CheckCircle2,
  Construction,
  Crosshair,
  Gauge,
  Loader2,
  Locate,
  Navigation,
  Radio,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { EditableField } from "./EditableField";
import { GuidedCaptureFlow } from "./GuidedCaptureFlow";
import { ProgressOverlay } from "@/components/feedback/ProgressOverlay";
import { vistoriasService } from "@/services/vistorias";
import { openNavigation } from "@/services/maps";
import { useGeolocation } from "@/hooks/useGeolocation";
import { formatLatLng } from "@/utils/format";
import type { CaptureBundle, DropdownKey, Vistoria } from "@/types";

interface FormState {
  pspostefield: string;
  alturadaantenafield: string;
  endereofield: string;
  aterramentofield: string;
  intensidadedesinalfield: string;
  velocidadefield: string;
  motivofield: string;
  observaofield: string;
  tipodeantena: string;
  ganhodbi: string;
  mododeoperacao: string;
  operadorafourg: string;
  tipodematerial: string;
  tensao: string;
  alimentacaodoequipamento: string;
  localdeinstalacao: string;
}

const EMPTY: FormState = {
  pspostefield: "",
  alturadaantenafield: "",
  endereofield: "",
  aterramentofield: "",
  intensidadedesinalfield: "",
  velocidadefield: "",
  motivofield: "",
  observaofield: "",
  tipodeantena: "",
  ganhodbi: "",
  mododeoperacao: "",
  operadorafourg: "",
  tipodematerial: "",
  tensao: "",
  alimentacaodoequipamento: "",
  localdeinstalacao: "",
};

interface VistoriaExecucaoFormProps {
  vistoria: Vistoria;
  onDone?: () => void;
  /** Quando dentro de um sheet, deixa a barra inferior absoluta dentro do container. */
  embedded?: boolean;
}

export function VistoriaExecucaoForm({
  vistoria,
  onDone,
  embedded,
}: VistoriaExecucaoFormProps) {
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY,
    pspostefield: vistoria.fields?.pspostefield ?? "",
    alturadaantenafield: vistoria.fields?.alturadaantenafield ?? "",
    endereofield: vistoria.fields?.endereofield ?? vistoria.endereco ?? "",
    aterramentofield: vistoria.fields?.aterramentofield ?? "",
    intensidadedesinalfield: vistoria.fields?.intensidadedesinalfield ?? "",
    velocidadefield: vistoria.fields?.velocidadefield ?? "",
    motivofield: vistoria.fields?.motivofield ?? "",
    observaofield: vistoria.fields?.observaofield ?? "",
  }));
  const [captures, setCaptures] = useState<CaptureBundle>({});
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number }>({
    lat: vistoria.latitude,
    lng: vistoria.longitude,
  });

  const geo = useGeolocation(false);

  useEffect(() => {
    setCoords({ lat: vistoria.latitude, lng: vistoria.longitude });
  }, [vistoria.latitude, vistoria.longitude]);

  const captureCount =
    (captures.imagem1 ? 1 : 0) +
    (captures.imagem2 ? 1 : 0) +
    (captures.imagem3 ? 1 : 0) +
    (captures.imagem4 ? 1 : 0) +
    (captures.imagem5 ? 1 : 0) +
    (captures.video360 ? 1 : 0);

  const setField = <K extends keyof FormState>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const refreshCoords = async () => {
    const next = await geo.refresh();
    if (next) setCoords({ lat: next.lat, lng: next.lng, accuracy: next.accuracy });
  };

  const onFinalize = async () => {
    if (!coords) return;
    setSubmitting(true);
    setDone(false);
    let pct = 8;
    setProgress(pct);
    const tick = window.setInterval(() => {
      pct = Math.min(92, pct + Math.random() * 12 + 4);
      setProgress(pct);
    }, 280);
    try {
      const dropdowns: Partial<Record<DropdownKey, string>> = {};
      const dropdownKeys: DropdownKey[] = [
        "tipodeantena",
        "ganhodbi",
        "mododeoperacao",
        "operadorafourg",
        "tipodematerial",
        "tensao",
        "alimentacaodoequipamento",
        "localdeinstalacao",
      ];
      for (const k of dropdownKeys) {
        if (form[k].trim()) dropdowns[k] = form[k].trim();
      }

      await vistoriasService.finalizarVistoria(
        {
          vistoria_id: vistoria.id,
          latitude: coords.lat,
          longitude: coords.lng,
          observacoes: form.observaofield,
          pspostefield: form.pspostefield || undefined,
          alturadaantenafield: form.alturadaantenafield || undefined,
          endereofield: form.endereofield || undefined,
          aterramentofield: form.aterramentofield || undefined,
          intensidadedesinalfield: form.intensidadedesinalfield || undefined,
          velocidadefield: form.velocidadefield || undefined,
          motivofield: form.motivofield || undefined,
          dropdowns,
          finalizadaEm: new Date().toISOString(),
        },
        captures
      );
      window.clearInterval(tick);
      setProgress(100);
      setDone(true);
      setTimeout(() => onDone?.(), 900);
    } catch {
      window.clearInterval(tick);
      setSubmitting(false);
    }
  };

  const canSubmit = captureCount >= 6 && !submitting;
  const bottomBarClass = embedded
    ? "sticky bottom-0 z-20 border-t border-brand-steel/60 bg-white/90 px-4 pb-4 pt-3 backdrop-blur-xl"
    : "fixed inset-x-0 bottom-0 z-30 border-t border-brand-steel/60 bg-white/85 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl";

  return (
    <div className={embedded ? "flex flex-col" : "relative flex min-h-[100dvh] flex-col bg-brand-ice pb-32"}>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden p-0">
            <div className="relative h-32 overflow-hidden bg-grad-deep p-5 text-white">
              <div
                aria-hidden
                className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-emerald/30 blur-3xl"
              />
              <div className="relative flex items-start justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/70">
                    GLPI · {vistoria.glpiId}
                  </span>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    {vistoria.equipamento}
                  </h2>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12">
                  <Wrench className="h-5 w-5" />
                </span>
              </div>
              <div className="relative mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={vistoria.status} />
                <PriorityBadge priority={vistoria.prioridade} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-brand-steel/70 text-sm">
              <ReadField label="Cidade" value={vistoria.cidade || "—"} />
              <ReadField label="Estado" value={vistoria.estado ?? "—"} />
              <ReadField label="Técnico" value={vistoria.tecnico.nome} colSpan />
            </div>
          </Card>
        </motion.div>

        <SectionCard
          icon={<Construction className="h-5 w-5" />}
          title="Dados do Poste"
          description="Localização geográfica e características estruturais."
          tone="emerald"
        >
          <div className="grid grid-cols-2 gap-2">
            <EditableField
              label="Latitude"
              value={coords.lat?.toFixed(6) ?? ""}
              icon={<Crosshair className="h-3 w-3" />}
              readOnly
            />
            <EditableField
              label="Longitude"
              value={coords.lng?.toFixed(6) ?? ""}
              icon={<Crosshair className="h-3 w-3" />}
              readOnly
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <span>
              {coords.accuracy
                ? `Precisão ±${Math.round(coords.accuracy)} m via GPS`
                : `Base GLPI: ${formatLatLng(vistoria.latitude, vistoria.longitude)}`}
            </span>
            {geo.error && <span className="text-red-500">{geo.error}</span>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="md"
              loading={geo.loading}
              leftIcon={<Locate className="h-4 w-4" />}
              onClick={refreshCoords}
            >
              Atualizar GPS
            </Button>
            <Button
              variant="outline"
              size="md"
              leftIcon={<Navigation className="h-4 w-4" />}
              onClick={() => openNavigation(coords.lat, coords.lng)}
            >
              Rota
            </Button>
          </div>

          <div className="mt-1 grid grid-cols-2 gap-2">
            <EditableField
              label="PS / Poste"
              value={form.pspostefield}
              placeholder="Ex.: PS-1234"
              onChange={(v) => setField("pspostefield", v)}
            />
            <EditableField
              label="Aterramento"
              value={form.aterramentofield}
              placeholder="Ex.: NBR 5419"
              onChange={(v) => setField("aterramentofield", v)}
            />
          </div>
          <EditableField
            label="Endereço"
            value={form.endereofield}
            placeholder="Rua, número, bairro"
            onChange={(v) => setField("endereofield", v)}
            colSpan
          />
          <div className="grid grid-cols-2 gap-2">
            <EditableField
              label="Tipo de material"
              value={form.tipodematerial}
              placeholder="Concreto, madeira, metal…"
              onChange={(v) => setField("tipodematerial", v)}
            />
            <EditableField
              label="Tensão"
              value={form.tensao}
              placeholder="Ex.: 220V"
              onChange={(v) => setField("tensao", v)}
            />
          </div>
        </SectionCard>

        <SectionCard
          icon={<Radio className="h-5 w-5" />}
          title="Rede Móvel"
          description="Indicadores de cobertura e operadora."
          tone="amber"
        >
          <div className="grid grid-cols-2 gap-2">
            <EditableField
              label="Velocidade"
              value={form.velocidadefield}
              placeholder="Ex.: 50 Mbps"
              icon={<Gauge className="h-3 w-3" />}
              onChange={(v) => setField("velocidadefield", v)}
            />
            <EditableField
              label="Intensidade de sinal"
              value={form.intensidadedesinalfield}
              placeholder="Ex.: -65 dBm"
              icon={<Radio className="h-3 w-3" />}
              onChange={(v) => setField("intensidadedesinalfield", v)}
            />
          </div>
          <EditableField
            label="Operadora 4G"
            value={form.operadorafourg}
            placeholder="Vivo, Claro, Tim…"
            onChange={(v) => setField("operadorafourg", v)}
            colSpan
          />
        </SectionCard>

        <SectionCard
          icon={<Antenna className="h-5 w-5" />}
          title="Detalhamento da Instalação"
          description="Configuração técnica do equipamento em campo."
          tone="deep"
        >
          <EditableField
            label="Motivo"
            value={form.motivofield}
            placeholder="Ex.: Instalação nova, manutenção…"
            onChange={(v) => setField("motivofield", v)}
            colSpan
          />
          <div className="grid grid-cols-2 gap-2">
            <EditableField
              label="Tipo de antena"
              value={form.tipodeantena}
              placeholder="Painel, omni, setorial…"
              onChange={(v) => setField("tipodeantena", v)}
            />
            <EditableField
              label="Ganho (dBi)"
              value={form.ganhodbi}
              placeholder="Ex.: 26,7dBi"
              onChange={(v) => setField("ganhodbi", v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EditableField
              label="Altura da antena"
              value={form.alturadaantenafield}
              placeholder="Ex.: 12 m"
              onChange={(v) => setField("alturadaantenafield", v)}
            />
            <EditableField
              label="Modo de operação"
              value={form.mododeoperacao}
              placeholder="TDD, FDD, etc."
              onChange={(v) => setField("mododeoperacao", v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EditableField
              label="Alimentação"
              value={form.alimentacaodoequipamento}
              placeholder="PoE, AC, bateria…"
              icon={<Zap className="h-3 w-3" />}
              onChange={(v) => setField("alimentacaodoequipamento", v)}
            />
            <EditableField
              label="Local de instalação"
              value={form.localdeinstalacao}
              placeholder="Topo do poste, abrigo…"
              onChange={(v) => setField("localdeinstalacao", v)}
            />
          </div>
        </SectionCard>

        <Card className="space-y-3">
          <GuidedCaptureFlow bundle={captures} onChange={setCaptures} />
        </Card>

        <Card className="space-y-2">
          <header className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                Observações
              </h3>
              <p className="text-xs text-ink-muted">
                Notas livres do técnico que serão enviadas ao GLPI.
              </p>
            </div>
          </header>
          <EditableField
            label="Observações técnicas"
            value={form.observaofield}
            placeholder="Toque para escrever…"
            onChange={(v) => setField("observaofield", v)}
            multiline
            colSpan
          />
        </Card>
      </main>

      <div className={bottomBarClass}>
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <div className="hidden flex-col text-xs text-ink-muted sm:flex">
            <span className="font-semibold text-ink">Pronto para enviar</span>
            <span>
              {captureCount}/6 evidências · {form.observaofield.length} caracteres
            </span>
          </div>
          <Button
            fullWidth
            size="xl"
            loading={submitting}
            disabled={!canSubmit}
            leftIcon={
              done ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin opacity-0" />
              )
            }
            onClick={onFinalize}
          >
            {done ? "Finalizada" : submitting ? "Enviando…" : "Finalizar Vistoria"}
          </Button>
        </div>
      </div>

      <ProgressOverlay
        open={submitting}
        progress={progress}
        title="Enviando vistoria"
        description={
          done
            ? "Sincronizando com o GLPI"
            : `${captureCount}/6 evidências · GPS · observações`
        }
        done={done}
      />
    </div>
  );
}

function ReadField({
  label,
  value,
  colSpan,
}: {
  label: string;
  value: string;
  colSpan?: boolean;
}) {
  return (
    <div className={`bg-white p-4 ${colSpan ? "col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-[14px] font-medium text-ink">{value}</p>
    </div>
  );
}

const SECTION_TONES = {
  emerald: {
    accent: "bg-brand-emerald/15 text-brand-emerald",
    ring: "from-brand-emerald/25 to-brand-emerald/0",
  },
  amber: {
    accent: "bg-brand-amber/20 text-[#8a5a00]",
    ring: "from-brand-amber/30 to-brand-amber/0",
  },
  deep: {
    accent: "bg-brand-deep/10 text-brand-deep",
    ring: "from-brand-deep/15 to-brand-deep/0",
  },
} as const;

function SectionCard({
  icon,
  title,
  description,
  tone = "emerald",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  tone?: keyof typeof SECTION_TONES;
  children: React.ReactNode;
}) {
  const t = SECTION_TONES[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="relative space-y-3 overflow-hidden">
        <div
          aria-hidden
          className={`pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${t.ring} blur-3xl`}
        />
        <header className="relative flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-ink-muted">{description}</p>
            )}
          </div>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${t.accent}`}
          >
            {icon}
          </span>
        </header>
        <div className="relative space-y-2">{children}</div>
      </Card>
    </motion.div>
  );
}
