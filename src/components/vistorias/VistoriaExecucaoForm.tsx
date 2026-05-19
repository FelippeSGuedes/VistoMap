"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Antenna,
  Camera,
  CheckCircle2,
  Construction,
  Crosshair,
  Gauge,
  Loader2,
  Locate,
  Lock,
  MapPin as MapPinIcon,
  Radio,
  Replace,
  Video,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { EditableField } from "./EditableField";
import { CaptureCameraModal } from "./CaptureCameraModal";
import { MudarPosteFlow } from "@/components/postes/MudarPosteFlow";
import { ProgressOverlay } from "@/components/feedback/ProgressOverlay";
import { vistoriasService } from "@/services/vistorias";
import { reverseGeocode } from "@/services/geocoding";
import { useGeolocation } from "@/hooks/useGeolocation";
import { cn } from "@/utils/cn";
import type {
  CaptureBundle,
  DropdownKey,
  MudancaPosteResponse,
  Vistoria,
} from "@/types";

interface FormState {
  pspostefield: string;
  municipiofield: string;
  alturadaantenafield: string;
  endereofield: string;
  endereco_rua: string;
  endereco_numero: string;
  endereco_estado: string;
  endereco_cep: string;
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

/**
 * Reverte o formato GLPI "ENDEREÇO : RUA,NUMERO,ESTADO,CEP" para os 4 sub-campos.
 * Token "—" é tratado como vazio. Se não reconhecer o formato, retorna 4 strings vazias.
 */
function parseGlpiEndereco(raw: string): {
  rua: string;
  numero: string;
  estado: string;
  cep: string;
} {
  const empty = { rua: "", numero: "", estado: "", cep: "" };
  if (!raw) return empty;
  const m = raw.match(/ENDERE(?:Ç|C)O\s*:\s*(.+)$/i);
  if (!m) return empty;
  const parts = m[1].split(",").map((s) => {
    const t = s.trim();
    return t === "—" || t === "-" ? "" : t;
  });
  return {
    rua: parts[0] ?? "",
    numero: parts[1] ?? "",
    estado: parts[2] ?? "",
    cep: parts[3] ?? "",
  };
}

const EMPTY: FormState = {
  pspostefield: "",
  municipiofield: "",
  alturadaantenafield: "",
  endereofield: "",
  endereco_rua: "",
  endereco_numero: "",
  endereco_estado: "",
  endereco_cep: "",
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
  const [form, setForm] = useState<FormState>(() => {
    const raw = vistoria.fields?.endereofield ?? vistoria.endereco ?? "";
    const addr = parseGlpiEndereco(raw);
    return {
      ...EMPTY,
      pspostefield: vistoria.fields?.pspostefield ?? "",
      municipiofield: vistoria.cidade ?? "",
      alturadaantenafield: vistoria.fields?.alturadaantenafield ?? "",
      endereofield: raw,
      endereco_rua: addr.rua,
      endereco_numero: addr.numero,
      endereco_estado: addr.estado,
      endereco_cep: addr.cep,
      aterramentofield: vistoria.fields?.aterramentofield ?? "",
      intensidadedesinalfield: vistoria.fields?.intensidadedesinalfield ?? "",
      velocidadefield: vistoria.fields?.velocidadefield ?? "",
      motivofield: vistoria.fields?.motivofield ?? "",
      observaofield: vistoria.fields?.observaofield ?? "",
      tipodeantena: vistoria.fields?.tipodeantena ?? "",
      ganhodbi: vistoria.fields?.ganhodbi ?? "",
      mododeoperacao: vistoria.fields?.mododeoperacao ?? "",
      operadorafourg: vistoria.fields?.operadorafourg ?? "",
      tipodematerial: vistoria.fields?.tipodematerial ?? "",
      tensao: vistoria.fields?.tensao ?? "",
      alimentacaodoequipamento: vistoria.fields?.alimentacaodoequipamento ?? "",
      localdeinstalacao: vistoria.fields?.localdeinstalacao ?? "",
    };
  });
  const [captures, setCaptures] = useState<CaptureBundle>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number }>({
    lat: vistoria.latitude,
    lng: vistoria.longitude,
  });

  const [mudarPosteOpen, setMudarPosteOpen] = useState(false);
  const [detectingAddress, setDetectingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const geoForAddress = useGeolocation(false);

  useEffect(() => {
    setCoords({ lat: vistoria.latitude, lng: vistoria.longitude });
  }, [vistoria.latitude, vistoria.longitude]);

  const handleDetectAddress = async () => {
    setDetectingAddress(true);
    setAddressError(null);
    try {
      // Pega GPS atual do técnico (não usa o do poste — endereço é onde ele tá fisicamente).
      const pos = geoForAddress.position ?? (await geoForAddress.refresh());
      if (!pos) {
        setAddressError("Sem GPS — autorize a localização.");
        return;
      }
      const addr = await reverseGeocode(pos.lat, pos.lng);
      setForm((f) => ({
        ...f,
        endereco_rua: addr.rua || f.endereco_rua,
        endereco_numero: addr.numero || f.endereco_numero,
        endereco_estado: (addr.estado_sigla || addr.estado || f.endereco_estado),
        endereco_cep: addr.cep || f.endereco_cep,
      }));
    } catch (err) {
      setAddressError(
        err instanceof Error ? err.message : "Falha ao buscar endereço"
      );
    } finally {
      setDetectingAddress(false);
    }
  };

  const handlePosteMudado = (response: MudancaPosteResponse) => {
    const p = response.poste_novo;
    setCoords({ lat: p.latitudefield, lng: p.longitudefield });
    setForm((f) => ({
      ...f,
      pspostefield: p.pspostefield,
      municipiofield: p.municipiofield,
      alturadaantenafield: p.alturadaantenafield ?? f.alturadaantenafield,
      tipodematerial: p.materialfield ?? f.tipodematerial,
      observaofield: f.observaofield
        ? `${f.observaofield}\n\n${response.descricao_glpi}`
        : response.descricao_glpi,
    }));
  };

  const captureCount =
    (captures.imagem1 ? 1 : 0) +
    (captures.imagem2 ? 1 : 0) +
    (captures.imagem3 ? 1 : 0) +
    (captures.imagem4 ? 1 : 0) +
    (captures.imagem5 ? 1 : 0) +
    (captures.video360 ? 1 : 0);

  const setField = <K extends keyof FormState>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * Formato pro GLPI:
   *   ENDEREÇO : {RUA},{NUMERO},{ESTADO},{CEP}
   * Campos vazios viram "—" pra manter o número fixo de tokens.
   */
  const buildEndereco = (): string => {
    const r = form.endereco_rua.trim();
    const n = form.endereco_numero.trim();
    const e = form.endereco_estado.trim();
    const c = form.endereco_cep.trim();
    if (!r && !n && !e && !c) return form.endereofield;
    return `ENDEREÇO : ${r || "—"},${n || "—"},${e || "—"},${c || "—"}`;
  };

  const onFinalize = async () => {
    if (!coords) return;
    setSubmitting(true);
    setDone(false);
    setSubmitError(null);
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
          municipiofield: form.municipiofield || undefined,
          alturadaantenafield: form.alturadaantenafield || undefined,
          endereofield: buildEndereco() || undefined,
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
      setTimeout(() => onDone?.(), 1400);
    } catch (err) {
      window.clearInterval(tick);
      setSubmitting(false);
      setProgress(0);
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.message ||
        (err as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.error ||
        (err instanceof Error ? err.message : "Falha ao enviar vistoria. Tente novamente.");
      setSubmitError(msg);
    }
  };

  const canSubmit = captureCount >= 6 && !submitting;
  const bottomBarClass = embedded
    ? "sticky bottom-0 z-20 border-t border-brand-steel/60 bg-white/90 px-4 pb-4 pt-3 backdrop-blur-xl"
    : "fixed inset-x-0 bottom-0 z-30 border-t border-brand-steel/60 bg-white/85 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl";

  return (
    <div
      className={
        embedded
          ? "relative flex min-h-full flex-col"
          : "relative flex min-h-[100dvh] flex-col bg-brand-ice"
      }
    >
      <main
        className={`mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-4 ${
          embedded ? "" : "pb-32"
        }`}
      >
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

        {/* ─── DADOS DO POSTE — Premium ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="relative overflow-hidden rounded-3xl border border-brand-steel/40 bg-white/90 p-5 shadow-soft backdrop-blur-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[radial-gradient(closest-side,rgba(0,179,136,0.18),rgba(0,179,136,0))] blur-2xl"
            />

            <header className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-steel/50 bg-white/80 text-brand-deep shadow-soft backdrop-blur">
                  <Construction className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                    Dados do Poste
                  </h3>
                  <p className="mt-0.5 text-[11px] font-medium tracking-wide text-ink-muted">
                    Localização e identificação do ativo
                  </p>
                </div>
              </div>
            </header>

            {/* Lat/Long premium */}
            <div className="relative mt-4 grid grid-cols-2 gap-2">
              <CoordTile label="Latitude" value={coords.lat?.toFixed(6) ?? ""} />
              <CoordTile label="Longitude" value={coords.lng?.toFixed(6) ?? ""} />
            </div>

            {/* Aviso */}
            <div className="relative mt-3 flex items-start gap-2 rounded-2xl bg-brand-emerald/8 px-3 py-2.5 text-[11px] leading-relaxed text-brand-deep">
              <Lock className="mt-0.5 h-3 w-3 shrink-0 text-brand-emerald" />
              <span>
                As coordenadas seguem o PSPOSTE selecionado. Para corrigir, use{" "}
                <strong className="font-semibold">Mudar PSPOSTE</strong>.
              </span>
            </div>

            {/* PS/Poste — premium */}
            <div className="relative mt-3 overflow-hidden rounded-3xl border border-brand-emerald/25 bg-gradient-to-br from-white to-brand-ice p-4">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-emerald">
                <MapPinIcon className="h-3 w-3" /> Poste atribuído
                <Lock className="ml-1 h-3 w-3 text-ink-muted/60" />
              </p>
              <div className="mt-1.5 flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[18px] font-semibold tracking-tight text-ink">
                    {form.pspostefield || "—"}
                  </p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {form.municipiofield || "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Replace className="h-3.5 w-3.5" />}
                  onClick={() => setMudarPosteOpen(true)}
                  className="shrink-0"
                >
                  Mudar PSPOSTE
                </Button>
              </div>
            </div>

            {/* Estrutura física */}
            <div className="relative mt-3 grid grid-cols-2 gap-2">
              <BoolToggle
                label="Aterramento"
                value={form.aterramentofield}
                onChange={(v) => setField("aterramentofield", v)}
              />
              <EditableField
                label="Altura da antena"
                value={form.alturadaantenafield}
                placeholder="12 m"
                onChange={(v) => setField("alturadaantenafield", v)}
              />
              <EditableField
                label="Tipo de material"
                value={form.tipodematerial}
                placeholder="Concreto, madeira, metal…"
                onChange={(v) => setField("tipodematerial", v)}
              />
              <EditableField
                label="Tensão"
                value={form.tensao}
                placeholder="220 V"
                onChange={(v) => setField("tensao", v)}
              />
            </div>

            {/* Endereço — sub-bloco com 4 campos + GPS */}
            <div className="relative mt-4 rounded-2xl border border-brand-steel/50 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-deep/8 text-brand-deep">
                    <MapPinIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                    Endereço do poste
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDetectAddress}
                  disabled={detectingAddress}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-emerald/12 px-3 text-[11px] font-semibold text-brand-emerald disabled:opacity-60"
                >
                  {detectingAddress ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Locate className="h-3 w-3" />
                  )}
                  {detectingAddress ? "Buscando…" : "Detectar via GPS"}
                </button>
              </div>

              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                Preenchimento <strong className="text-ink">somente via GPS</strong>.
                Toque em <em>Detectar via GPS</em> para resolver via OpenStreetMap.
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <EditableField
                  label="Rua"
                  value={form.endereco_rua}
                  placeholder="—"
                  readOnly
                  colSpan
                />
                <EditableField
                  label="Número"
                  value={form.endereco_numero}
                  placeholder="—"
                  readOnly
                />
                <EditableField
                  label="Estado"
                  value={form.endereco_estado}
                  placeholder="—"
                  readOnly
                />
                <EditableField
                  label="CEP"
                  value={form.endereco_cep}
                  placeholder="—"
                  readOnly
                  colSpan
                />
              </div>

              {addressError && (
                <p className="mt-2 rounded-xl bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-600">
                  {addressError}
                </p>
              )}
            </div>
          </Card>
        </motion.div>

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
          <EditableField
            label="Modo de operação"
            value={form.mododeoperacao}
            placeholder="TDD, FDD, etc."
            onChange={(v) => setField("mododeoperacao", v)}
            colSpan
          />
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
          <header className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                Evidências de campo
              </h3>
              <p className="text-xs text-ink-muted">
                {captureCount}/6 etapas validadas · 5 fotos + 1 vídeo 360°
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-amber/20 text-[#8a5a00]">
              <Camera className="h-5 w-5" />
            </span>
          </header>

          <CaptureProgressBar count={captureCount} total={6} />

          <CaptureThumbnails bundle={captures} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              fullWidth
              size="lg"
              leftIcon={<Camera className="h-4 w-4" />}
              onClick={() => setCameraOpen(true)}
            >
              {captureCount === 0
                ? "Abrir câmera"
                : captureCount < 6
                ? "Continuar captura"
                : "Revisar evidências"}
            </Button>
            {captureCount > 0 && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setCaptures({})}
              >
                Limpar
              </Button>
            )}
          </div>
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
        {submitError && (
          <div className="mx-auto mb-2 flex w-full max-w-xl items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-medium text-red-700">
            <span aria-hidden>❌</span>
            <div className="flex-1">
              <p className="font-semibold">Falha ao finalizar vistoria</p>
              <p className="mt-0.5 text-[11px] font-normal text-red-600/90">{submitError}</p>
            </div>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
            >
              Fechar
            </button>
          </div>
        )}
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
            {done ? "Finalizada ✓" : submitting ? "Enviando…" : "Finalizar Vistoria"}
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

      <CaptureCameraModal
        open={cameraOpen}
        bundle={captures}
        onChange={setCaptures}
        onClose={() => setCameraOpen(false)}
        equipmentName={vistoria.equipamento}
      />

      <MudarPosteFlow
        open={mudarPosteOpen}
        onClose={() => setMudarPosteOpen(false)}
        vistoriaId={vistoria.id}
        psposteAntigo={form.pspostefield}
        municipioAntigo={vistoria.cidade}
        latAtual={coords.lat}
        lngAtual={coords.lng}
        onApplied={handlePosteMudado}
      />
    </div>
  );
}

function CaptureProgressBar({
  count,
  total,
}: {
  count: number;
  total: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex h-2 gap-1 overflow-hidden rounded-full bg-brand-steel/60">
        {Array.from({ length: total }).map((_, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={{
              backgroundColor: i < count ? "#06D6A0" : "rgba(229,231,235,0)",
            }}
            transition={{ duration: 0.4 }}
            className="h-full flex-1 rounded-full"
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        <span>{count} de {total} validadas</span>
        <span className={count === total ? "text-brand-emerald" : ""}>
          {Math.round((count / total) * 100)}%
        </span>
      </div>
    </div>
  );
}

const THUMB_LABELS = [
  { key: "imagem1" as const, label: "Poste completo" },
  { key: "imagem2" as const, label: "Topo" },
  { key: "imagem3" as const, label: "Base" },
  { key: "video360" as const, label: "Vídeo 360°", isVideo: true },
  { key: "imagem4" as const, label: "Vivo" },
  { key: "imagem5" as const, label: "Claro" },
];

function CaptureThumbnails({ bundle }: { bundle: CaptureBundle }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {THUMB_LABELS.map((t) => {
        const blob = bundle[t.key];
        const hasBlob = blob instanceof Blob;
        return (
          <div
            key={t.key}
            className={`relative aspect-square overflow-hidden rounded-2xl border ${
              hasBlob
                ? "border-brand-emerald/50 bg-black"
                : "border-dashed border-brand-steel/70 bg-brand-ice/80"
            }`}
          >
            {hasBlob ? (
              <ThumbPreview blob={blob as Blob} isVideo={!!("isVideo" in t && t.isVideo)} />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
                {"isVideo" in t && t.isVideo ? (
                  <Video className="h-4 w-4 text-ink-muted" />
                ) : (
                  <Camera className="h-4 w-4 text-ink-muted" />
                )}
                <span className="text-[10px] font-semibold text-ink-muted">
                  {t.label}
                </span>
              </div>
            )}
            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">
              {t.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ThumbPreview({
  blob,
  isVideo,
}: {
  blob: Blob;
  isVideo: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return isVideo ? (
    <video src={url} className="h-full w-full object-cover" muted playsInline />
  ) : (
    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
  );
}

function BoolToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const is1 = value === "1";
  const is0 = value === "0";
  return (
    <div className="rounded-2xl border border-brand-steel/70 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-brand-ice p-1">
        <button
          type="button"
          onClick={() => onChange("1")}
          className={cn(
            "h-9 rounded-lg text-[13px] font-semibold transition",
            is1
              ? "bg-brand-emerald text-white shadow-soft"
              : "text-ink-muted hover:text-ink"
          )}
        >
          Sim
        </button>
        <button
          type="button"
          onClick={() => onChange("0")}
          className={cn(
            "h-9 rounded-lg text-[13px] font-semibold transition",
            is0
              ? "bg-red-500 text-white shadow-soft"
              : "text-ink-muted hover:text-ink"
          )}
        >
          Não
        </button>
      </div>
    </div>
  );
}

function CoordTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-brand-steel/40 bg-white px-4 py-3 shadow-soft">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-[radial-gradient(closest-side,rgba(0,179,136,0.15),rgba(0,179,136,0))]"
      />
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        <Crosshair className="h-3 w-3" />
        {label}
        <Lock className="ml-auto h-3 w-3 text-ink-muted/50" />
      </p>
      <p className="mt-1 truncate font-mono text-[15px] font-semibold text-ink tabular-nums">
        {value || "—"}
      </p>
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
