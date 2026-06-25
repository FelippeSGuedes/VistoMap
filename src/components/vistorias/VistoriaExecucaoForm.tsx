"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Construction,
  Crosshair,
  History,
  Loader2,
  Locate,
  Lock,
  MapPin as MapPinIcon,
  Radio,
  Replace,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EditableField } from "./EditableField";
import { VistoriaHeaderHero } from "./VistoriaHeaderHero";
import { CaptureCameraModal } from "./CaptureCameraModal";
import { MudarPosteFlow } from "@/components/postes/MudarPosteFlow";
import { ProgressOverlay } from "@/components/feedback/ProgressOverlay";
import { vistoriasService } from "@/services/vistorias";
import { reverseGeocode } from "@/services/geocoding";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuthStore } from "@/store/auth";
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
  alturadopostemfield: string;
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
 * Reverte o formato CSV "Rua,Numero,Estado,CEP" (novo) ou o legado
 * "ENDEREÇO : Rua,Numero,Estado,CEP" para os 4 sub-campos.
 * Token "—" é tratado como vazio.
 */
function parseGlpiEndereco(raw: string): {
  rua: string;
  numero: string;
  estado: string;
  cep: string;
} {
  const empty = { rua: "", numero: "", estado: "", cep: "" };
  if (!raw) return empty;
  // Suporte ao formato legado com prefixo
  const m = raw.match(/ENDERE(?:Ç|C)O\s*:\s*(.+)$/i);
  const csv = m ? m[1] : raw;
  const parts = csv.split(",").map((s) => {
    const t = s.trim();
    return t === "—" || t === "-" ? "" : t;
  });
  if (parts.length < 4 && !m) return empty;
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
  alturadopostemfield: "",
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
      alturadopostemfield: vistoria.fields?.alturadopostemfield ?? "",
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

  // Técnico SEMPRE puxado da sessão logada (não do `vistoria.tecnico` do GLPI,
  // que vem com placeholder "—"). Mostra nome completo.
  const sessionTecnico = useAuthStore((s) => s.session?.tecnico);
  const tecnicoLogadoNome = sessionTecnico?.nome ?? vistoria.tecnico?.nome ?? "—";

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
      alturadopostemfield: p.alturadopostemfield ?? f.alturadopostemfield,
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
    return `${r || "—"},${n || "—"},${e || "—"},${c || "—"}`;
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
          alturadopostemfield: form.alturadopostemfield || undefined,
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
      // O titulo do box ja diz "Falha ao finalizar vistoria"; aqui queremos a
      // CAUSA real. Backend manda { message: generico, error: causa } no 500 —
      // entao prioriza `error` sobre `message` pra nao repetir o titulo.
      const data = (
        err as { response?: { data?: { message?: string; error?: string } } }
      )?.response?.data;
      const msg =
        data?.error ||
        data?.message ||
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
            <VistoriaHeaderHero vistoria={vistoria} height={150} />
            <div className="grid grid-cols-2 gap-px bg-brand-steel/70 text-sm">
              <ReadField label="Cidade" value={vistoria.cidade || "—"} />
              <ReadField label="Estado" value={vistoria.estado ?? "—"} />
              <ReadField label="Técnico" value={tecnicoLogadoNome} colSpan />
              <ReadField
                label="Revisita?"
                value={vistoria.isRepeat ? "Sim" : "Não"}
                tone={vistoria.isRepeat ? "warn" : "ok"}
                colSpan={!vistoria.isRepeat}
              />
              {vistoria.isRepeat && (
                <ReadField
                  label="Motivo"
                  value={vistoria.fields?.motivofield?.trim() || "Não informado"}
                />
              )}
            </div>
          </Card>
        </motion.div>

        <RepeatFlag
          isRepeat={!!vistoria.isRepeat}
          motivoAnterior={vistoria.fields?.motivofield}
        />

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
                label="Altura do poste (m)"
                value={form.alturadopostemfield}
                placeholder="Ex.: 11"
                onChange={(v) => setField("alturadopostemfield", v)}
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
        watermark={{
          lat: coords?.lat,
          lng: coords?.lng,
          vistoriador: tecnicoLogadoNome,
        }}
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
  { key: "imagem3" as const, label: "Vista horizontal" },
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

/**
 * Flag visual destacada no topo da vistoria.
 * - is_repeat=0 → badge esmeralda discreta "Primeira Vistoria"
 * - is_repeat=1 → card âmbar com glow + ícone alerta + motivo da reprovação
 *
 * Objetivo: técnico identifica em ms se o equipamento já foi reprovado antes.
 */
function RepeatFlag({
  isRepeat,
  motivoAnterior,
}: {
  isRepeat: boolean;
  motivoAnterior?: string;
}) {
  if (!isRepeat) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="flex items-center gap-2.5 rounded-2xl border border-brand-emerald/30 bg-brand-emerald/8 px-3.5 py-2.5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-emerald/15 text-brand-emerald">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-emerald">
            Primeira Vistoria
          </p>
          <p className="text-[12px] text-ink-muted">
            Equipamento sem histórico de reprovação.
          </p>
        </div>
        <Sparkles className="h-3.5 w-3.5 text-brand-emerald/70" />
      </motion.div>
    );
  }
  const motivo = motivoAnterior?.trim();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.08, ease: [0.22, 0.7, 0.2, 1] }}
      className="relative overflow-hidden rounded-3xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50/40 p-4 shadow-[0_4px_24px_-4px_rgba(245,158,11,0.4)]"
    >
      {/* glow pulsante */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-amber-400/35 via-orange-400/20 to-transparent blur-2xl"
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex items-start gap-3">
        <motion.span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/40"
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2 }}
        >
          <AlertTriangle className="h-5 w-5" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-sm">
              <History className="h-3 w-3" />
              Revisita
            </span>
          </div>
          <p className="mt-1 text-[14px] font-semibold tracking-tight text-amber-900">
            Equipamento já reprovado anteriormente
          </p>
          {motivo ? (
            <div className="mt-2.5 rounded-xl border border-amber-300/60 bg-white/70 px-3 py-2 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                Motivo da reprovação anterior
              </p>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-amber-950">
                {motivo}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-amber-700/80">
              Motivo da reprovação não registrado.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ReadField({
  label,
  value,
  colSpan,
  tone,
}: {
  label: string;
  value: string;
  colSpan?: boolean;
  /** Tom semântico — "warn" = âmbar (revisita), "ok" = esmeralda (primeira). */
  tone?: "warn" | "ok";
}) {
  const toneStyle =
    tone === "warn"
      ? { color: "#B45309", fontWeight: 600 as const }
      : tone === "ok"
      ? { color: "#00875F", fontWeight: 600 as const }
      : undefined;
  return (
    <div className={`bg-white p-4 ${colSpan ? "col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p
        className="mt-1 truncate text-[14px] font-medium text-ink"
        style={toneStyle}
      >
        {value}
      </p>
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
