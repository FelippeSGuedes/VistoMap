"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, Box, Calendar, Check, CheckCircle2,
  ClipboardList, FileText, FileWarning, Gauge, HelpCircle, Home, Image as ImageIcon,
  MapPin, MapPinOff, Milestone, Navigation, RadioTower, RefreshCw, Ruler, Search,
  Settings, Signal, Trash2, TrendingUp, Undo2, User, UserCheck, Video, VideoOff,
  Wifi, Wrench, X, XCircle, Zap, ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { asset } from "@/utils/asset";
import { DEVOLUCAO_ITENS, DEVOLUCAO_MOTIVOS, devolucaoPrecisaDeslocamento } from "@/lib/glpi/devolucaoItens";

/* ── Ícones do modal "Devolver" (design premium dark) ────────────────── */
const FOTO_ICON: Record<string, LucideIcon> = {
  imagem1: ImageIcon, imagem2: ImageIcon, imagem3: ImageIcon,
  video360: Video, imagem4: ImageIcon, imagem5: ImageIcon,
};
const CAMPO_ICON: Record<string, LucideIcon> = {
  pspostefield: Milestone, municipiofield: MapPin, endereofield: Home,
  tipodematerial: Box, alturadopostemfield: Ruler, aterramentofield: Zap,
  danfield: Gauge, instalartpfield: Wrench, tensovfield: Zap,
  rsrpifield: Signal, tipoifield: Wifi, rsrpllfield: Signal, tipollfield: Wifi,
  tipodeantena: RadioTower, ganhodbi: TrendingUp, equipamentofield: Settings,
  observacao: FileText,
};
const MOTIVO_ICON: Record<string, LucideIcon> = {
  "Foto desfocada ou ilegível": ImageIcon,
  "Foto não mostra o item exigido": AlertCircle,
  "Vídeo incompleto ou de má qualidade": VideoOff,
  "Informação incorreta": XCircle,
  "Informação incompleta": AlertTriangle,
  "Print da operadora inválido ou ilegível": FileWarning,
  "Localização/endereço divergente": MapPinOff,
  Outro: HelpCircle,
};
const DEV_ORANGE = "#FF8A00";
const DEV_PURPLE = "#8B5CF6";
const DEV_RED = "#FF4D67";

interface Vistoria {
  id: number;
  equipamento: string;
  municipio: string | null;
  situacao_id: number;
  situacao: string;
  status_name: string | null;
  tecnico_id: number | null;
  tecnico_nome: string | null;
  data_vistoria: string | null;
  is_repeat: number;
}

interface Tecnico {
  users_id: number;
  nome: string;
  email: string | null;
  status_operacional: string;
}

// 7 = Em Deslocamento. Faltava aqui: cards nesse estado apareciam como "?"
// cinza, sem rótulo nem cor, porque a situação existe no GLPI mas nunca tinha
// sido mapeada nesta tela. Teal é o mesmo do mapa 3D — o analista vê a mesma
// cor pro mesmo estado nas duas telas.
const SITUACAO_LABEL: Record<number, string> = {
  0: "Indefinido", 1: "A Vistoriar", 2: "Em Vistoria", 3: "Vistoriado",
  4: "Ag. Revisita", 5: "Em Revisita", 6: "Revisitado",
  7: "Em Deslocamento", 8: "Devolvida",
};
const SITUACAO_COLOR: Record<number, string> = {
  0: "#9AA7B4", 1: "#F59E0B", 2: "#3B82F6", 3: "#00B388",
  4: "#F97316", 5: "#0EA5E9", 6: "#10B981",
  7: "#00D4A0", 8: "#DC2626",
};

/**
 * ESTADO do card — o que o analista enxerga, que não é a mesma coisa que a
 * situação crua do GLPI.
 *
 * "Atribuído" não existe como situação: é A Vistoriar QUE JÁ TEM TÉCNICO. A
 * distinção importa na operação — uma pendência sem dono e uma pendência já
 * despachada exigem ações diferentes — mas o GLPI guarda as duas no mesmo
 * número. Derivar aqui evita inventar um estado no banco só pra isso.
 */
type EstadoCard = number | "ATRIBUIDO";

function estadoDaVistoria(situacaoId: number, temTecnico: boolean): EstadoCard {
  return situacaoId === 1 && temTecnico ? "ATRIBUIDO" : situacaoId;
}

const ATRIBUIDO_LABEL = "Atribuído";
const ATRIBUIDO_COLOR = "#8B5CF6"; // roxo
const ATRIBUIDO_BG = { light: "/atrcl.png", dark: "/atrbl.png" };

/**
 * PENDENTE é um AGRUPAMENTO, não um estado: tudo que ainda não foi concluído
 * (não vistoriado nem revisitado). Serve pro analista perguntar "o que falta?"
 * sem ter que somar quatro filtros na cabeça. Por isso ele só existe no
 * filtro — nenhum card é rotulado "Pendente", cada um mostra seu estado real.
 */
const PENDENTE_COLOR = "#D4A017"; // amarelo dourado
const PENDENTE_BG = { light: "/pndcl.png", dark: "/pndp.png" };
const SITUACOES_CONCLUIDAS = new Set([3, 6]); // Vistoriado, Revisitado
function ehPendente(situacaoId: number): boolean {
  return !SITUACOES_CONCLUIDAS.has(situacaoId);
}

/**
 * Estados pendentes que não têm identidade visual própria herdam a do
 * "pendente" (dourado). Ag. Revisita e Indefinido caem aqui; Devolvida NÃO,
 * porque vermelho ali é alerta e trocar por dourado esconderia a gravidade.
 */
const SITUACOES_VISUAL_PENDENTE = new Set([0, 4]);

/** Fundo por estado — claro/escuro. */
const SITUACAO_BG: Partial<Record<number, { light: string; dark: string }>> = {
  1: { light: "/avistoriarlaranja.png", dark: "/avistoriarlaranjablack.png" }, // A Vistoriar
  2: { light: "/avistoriarazul.png", dark: "/avistoriarazulblack.png" }, // Em Vistoria
  3: { light: "/vistoriadoverde.png", dark: "/vistoriadoverdeblack.png" }, // Vistoriado
  7: { light: "/dsccl.png", dark: "/dscclbl.png" }, // Em Deslocamento
};

function bgDoEstado(estado: EstadoCard) {
  if (estado === "ATRIBUIDO") return ATRIBUIDO_BG;
  if (SITUACOES_VISUAL_PENDENTE.has(estado)) return PENDENTE_BG;
  return SITUACAO_BG[estado];
}
function corDoEstado(estado: EstadoCard) {
  if (estado === "ATRIBUIDO") return ATRIBUIDO_COLOR;
  if (SITUACOES_VISUAL_PENDENTE.has(estado)) return PENDENTE_COLOR;
  return SITUACAO_COLOR[estado] ?? "#9AA7B4";
}

/** Cor + fundo translúcido consistentes nos dois temas (opacidade absorve o contraste). */
function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Mesmo tint de cor, mas com um "forro" opaco (var(--vm-card)) por baixo —
 * sem isso, badges/botões translúcidos em cima de um card com imagem de
 * fundo (SITUACAO_BG) pegam a cor da imagem por trás e o chip perde
 * contorno (ex.: badge verde de "Vistoriado" some dentro do próprio fundo
 * verde do card). Em cards sem imagem de fundo não muda nada visualmente
 * — var(--vm-card) já é a cor do card ali.
 */
function tintOnCard(hex: string, alpha: number) {
  return `linear-gradient(${tint(hex, alpha)}, ${tint(hex, alpha)}), var(--vm-card)`;
}

function SituacaoBadge({ estado }: { estado: EstadoCard }) {
  const label = estado === "ATRIBUIDO" ? ATRIBUIDO_LABEL : (SITUACAO_LABEL[estado] ?? "?");
  const color = corDoEstado(estado);
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: tintOnCard(color, 0.15), color, border: `1px solid ${tint(color, 0.32)}` }}
    >
      {label}
    </span>
  );
}

/* ── Estilo compartilhado: inputs/selects/textarea legíveis nos 2 temas ── */
const fieldStyle = {
  background: "var(--vm-tile)",
  borderColor: "var(--vm-border)",
  color: "var(--vm-text)",
} as const;

function ModalShell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className={`${wide ? "max-w-lg" : "max-w-md"} max-h-[90vh] w-full overflow-y-auto rounded-2xl p-6`}
        style={{
          background: "var(--vm-card)",
          border: "1px solid var(--vm-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onToggle,
  accent,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  accent: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] transition"
      style={{
        border: `1px solid ${checked ? tint(accent, 0.5) : "var(--vm-border)"}`,
        background: checked ? tint(accent, 0.12) : "var(--vm-tile)",
        color: checked ? accent : "var(--vm-text-soft)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 rounded"
        style={{ accentColor: accent }}
      />
      {label}
    </label>
  );
}

/* ── Card de item selecionável do modal "Devolver" (design premium dark) ── */
function DevCheckCard({
  label, checked, onToggle, icon: Icon, accent,
}: { label: string; checked: boolean; onToggle: () => void; icon: LucideIcon; accent: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        borderColor: checked ? tint(accent, 0.55) : "rgba(255,255,255,0.08)",
        background: checked ? tint(accent, 0.12) : "rgba(255,255,255,0.03)",
        boxShadow: checked ? `0 8px 24px ${tint(accent, 0.18)}` : "none",
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition duration-200 group-hover:scale-105"
        style={{ background: tint(accent, checked ? 0.22 : 0.14), color: accent }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" style={{ color: checked ? "#F4F4F5" : "#D4D4D8" }}>
        {label}
      </span>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition duration-200"
        style={{
          borderColor: checked ? accent : "rgba(255,255,255,0.18)",
          background: checked ? accent : "transparent",
        }}
      >
        {checked && <Check className="h-3.5 w-3.5" style={{ color: "#16181D" }} strokeWidth={3} />}
      </span>
    </button>
  );
}

function DevCard({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1B1E24" }}>
      <h3 className="text-[16px] font-bold" style={{ color: "#F4F4F5" }}>{title}</h3>
      <p className="mt-1 mb-4 text-[13px]" style={{ color: "#9CA3AF" }}>{description}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export default function CentralVistoriasPage() {
  const { session } = useAuthStore();
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  // Valor do filtro: número = situação crua; "ATRIBUIDO" e "PENDENTE" são
  // conceitos derivados (ver estadoDaVistoria/ehPendente).
  const [filtroSit, setFiltroSit] = useState<string>("");

  // Cancelar
  const [cancelando, setCancelando] = useState<Vistoria | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Reatribuir
  const [reatrib, setReatrib] = useState<Vistoria | null>(null);
  const [novoTecnico, setNovoTecnico] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  const [reatribLoading, setReatribLoading] = useState(false);

  // Desatribuir — movido de Pendentes pra cá (2026-08-14): em Pendentes não
  // dava pra ver se o item tinha devolução/recusa em aberto antes de tirar
  // o técnico, o que já causou perda de contexto em produção. Aqui o card
  // mostra a situação/histórico antes de confirmar.
  const [desatribuindo, setDesatribuindo] = useState<Vistoria | null>(null);
  const [desatribuirLoading, setDesatribuirLoading] = useState(false);

  // Devolver
  const [devolvendo, setDevolvendo] = useState<Vistoria | null>(null);
  const [devItens, setDevItens] = useState<string[]>([]);
  const [devMotivos, setDevMotivos] = useState<string[]>([]);
  const [devMotivoOutro, setDevMotivoOutro] = useState("");
  const [devOutroTecnico, setDevOutroTecnico] = useState(false);
  const [devNovoTecnicoId, setDevNovoTecnicoId] = useState<number | "">("");
  const [devLoading, setDevLoading] = useState(false);

  // Devolver — corrigir localização do poste (só aparece quando o item
  // apontado é print da operadora — sinal de que o poste pode estar errado).
  const [devPosteOpen, setDevPosteOpen] = useState(false);
  const [devPosteLoading, setDevPosteLoading] = useState(false);
  const [devPosteOriginal, setDevPosteOriginal] = useState<{
    psPoste: string; endereco: string; latitude: string; longitude: string;
  } | null>(null);
  const [devPsPosteNovo, setDevPsPosteNovo] = useState("");
  const [devEnderecoNovo, setDevEnderecoNovo] = useState("");
  const [devLatNovo, setDevLatNovo] = useState("");
  const [devLngNovo, setDevLngNovo] = useState("");

  const headers = { Authorization: `Bearer ${session?.token}` };

  const fetchData = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const [vRes, tRes] = await Promise.all([
        api.get<{ vistorias: Vistoria[] }>("/painel/central-vistorias", { headers }),
        api.get<{ tecnicos: Tecnico[] }>("/painel/mapa", { headers }),
      ]);
      setVistorias(vRes.data.vistorias);
      setTecnicos(tRes.data.tecnicos ?? []);
    } catch { /* ignora */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtradas = useMemo(() => vistorias.filter((v) => {
    if (filtroSit === "PENDENTE") {
      if (!ehPendente(v.situacao_id)) return false;
    } else if (filtroSit === "ATRIBUIDO") {
      if (estadoDaVistoria(v.situacao_id, !!v.tecnico_nome) !== "ATRIBUIDO") return false;
    } else if (filtroSit === "1") {
      // "A Vistoriar" agora significa SEM técnico: com técnico, o card é
      // Atribuído e tem filtro próprio. Sem esta exclusão os dois filtros
      // devolveriam os mesmos itens e "A Vistoriar" deixaria de responder
      // "o que ainda não tem dono?", que é justamente pra isso que serve.
      if (estadoDaVistoria(v.situacao_id, !!v.tecnico_nome) !== 1) return false;
    } else if (filtroSit !== "" && v.situacao_id !== Number(filtroSit)) {
      return false;
    }
    const q = busca.toLowerCase();
    return (
      v.equipamento.toLowerCase().includes(q) ||
      (v.municipio ?? "").toLowerCase().includes(q) ||
      (v.tecnico_nome ?? "").toLowerCase().includes(q)
    );
  }), [vistorias, busca, filtroSit]);

  async function handleCancelar() {
    if (!cancelando || cancelConfirm !== "CANCELAR") return;
    setCancelLoading(true);
    try {
      await api.post(`/painel/central-vistorias/${cancelando.id}/cancelar`, {}, { headers });
      setCancelando(null);
      setCancelConfirm("");
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setCancelLoading(false); }
  }

  async function handleReatribuir() {
    if (!reatrib || !novoTecnico || !motivo.trim()) return;
    setReatribLoading(true);
    try {
      await api.post(
        `/painel/central-vistorias/${reatrib.id}/reatribuir`,
        { tecnicoId: novoTecnico, motivo: motivo.trim() },
        { headers }
      );
      setReatrib(null);
      setNovoTecnico("");
      setMotivo("");
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setReatribLoading(false); }
  }

  async function handleDesatribuir() {
    if (!desatribuindo) return;
    setDesatribuirLoading(true);
    try {
      await api.post(
        "/painel/atribuir",
        { vistoria_id: desatribuindo.id, tecnico_id: 0 },
        { headers }
      );
      setDesatribuindo(null);
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setDesatribuirLoading(false); }
  }

  function toggleDevItem(key: string) {
    setDevItens((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function toggleDevMotivo(m: string) {
    setDevMotivos((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  const mostrarMudarPoste = devItens.includes("imagem4") || devItens.includes("imagem5");

  // Busca a localização atual do poste só quando a seção "poste errado?"
  // realmente pode aparecer (evita 1 requisição a mais em toda devolução).
  useEffect(() => {
    if (!devolvendo || !mostrarMudarPoste || devPosteOriginal || devPosteLoading) return;
    setDevPosteLoading(true);
    api
      .get<{ vistoria: { endereco?: string | null; latitude?: number | null; longitude?: number | null; fields?: { pspostefield?: string } } }>(
        `/painel/vistoria/${devolvendo.id}`,
        { headers }
      )
      .then(({ data }) => {
        const v = data.vistoria;
        const original = {
          psPoste: v.fields?.pspostefield ?? "",
          endereco: v.endereco ?? "",
          latitude: v.latitude != null ? String(v.latitude) : "",
          longitude: v.longitude != null ? String(v.longitude) : "",
        };
        setDevPosteOriginal(original);
        setDevPsPosteNovo(original.psPoste);
        setDevEnderecoNovo(original.endereco);
        setDevLatNovo(original.latitude);
        setDevLngNovo(original.longitude);
      })
      .catch(() => { /* segue sem prefill — analista digita do zero */ })
      .finally(() => setDevPosteLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devolvendo, mostrarMudarPoste, devPosteOriginal, devPosteLoading]);

  function resetDevolverState() {
    setDevolvendo(null);
    setDevItens([]);
    setDevMotivos([]);
    setDevMotivoOutro("");
    setDevOutroTecnico(false);
    setDevNovoTecnicoId("");
    setDevPosteOpen(false);
    setDevPosteOriginal(null);
    setDevPsPosteNovo("");
    setDevEnderecoNovo("");
    setDevLatNovo("");
    setDevLngNovo("");
  }

  async function handleDevolver() {
    if (!devolvendo || devItens.length === 0 || devMotivos.length === 0) return;
    if (devMotivos.includes("Outro") && !devMotivoOutro.trim()) return;
    if (devOutroTecnico && !devNovoTecnicoId) return;
    setDevLoading(true);
    try {
      const posteMudou =
        mostrarMudarPoste &&
        devPosteOriginal != null &&
        (devPsPosteNovo.trim() !== devPosteOriginal.psPoste.trim() ||
          devEnderecoNovo.trim() !== devPosteOriginal.endereco.trim() ||
          devLatNovo.trim() !== devPosteOriginal.latitude.trim() ||
          devLngNovo.trim() !== devPosteOriginal.longitude.trim());

      await api.post(
        `/painel/central-vistorias/${devolvendo.id}/devolver`,
        {
          itens: devItens,
          motivos: devMotivos,
          motivoOutro: devMotivoOutro.trim() || undefined,
          novoTecnicoId: devOutroTecnico && devNovoTecnicoId ? devNovoTecnicoId : undefined,
          ...(posteMudou
            ? {
                psPoste: devPsPosteNovo.trim() || undefined,
                endereco: devEnderecoNovo.trim() || undefined,
                latitude: devLatNovo.trim() ? Number(devLatNovo) : undefined,
                longitude: devLngNovo.trim() ? Number(devLngNovo) : undefined,
              }
            : {}),
        },
        { headers }
      );
      resetDevolverState();
      await fetchData();
    } catch { /* TODO: toast */ }
    finally { setDevLoading(false); }
  }

  const precisaDeslocFlag = devItens.length > 0 ? devolucaoPrecisaDeslocamento(devItens) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--vm-accent-tint)", color: "#00875F" }}
          >
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: "var(--vm-text)" }}>Central de Vistorias</h1>
            <p className="text-[13px]" style={{ color: "var(--vm-muted)" }}>
              Cancele, reatribua ou devolva vistorias com registro de motivo.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:brightness-95"
          style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)" }}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            style={{ color: "var(--vm-muted)" }}
          />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--vm-faint)" }}
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar equipamento, município, técnico…"
            className="w-full rounded-xl py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />
        </div>
        <div className="relative">
          <select
            value={filtroSit}
            onChange={(e) => setFiltroSit(e.target.value)}
            className="appearance-none rounded-xl py-2 pl-3 pr-8 text-[13px] outline-none focus:border-[#00B388]"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          >
            <option value="">Todas situações</option>
            {/* Pendente primeiro: é a pergunta mais frequente do analista
                ("o que falta?") e agrupa tudo que não foi concluído. */}
            <option value="PENDENTE">Pendentes</option>
            <option value="1">A Vistoriar (sem técnico)</option>
            <option value="ATRIBUIDO">{ATRIBUIDO_LABEL}</option>
            <option value="7">{SITUACAO_LABEL[7]}</option>
            <option value="2">{SITUACAO_LABEL[2]}</option>
            <option value="3">{SITUACAO_LABEL[3]}</option>
            <option value="4">{SITUACAO_LABEL[4]}</option>
            <option value="5">{SITUACAO_LABEL[5]}</option>
            <option value="6">{SITUACAO_LABEL[6]}</option>
            <option value="8">{SITUACAO_LABEL[8]}</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--vm-faint)" }}
          />
        </div>
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: "var(--vm-faint)" }}>
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtradas.length === 0 ? (
        <div
          className="rounded-2xl py-16 text-center text-[13px]"
          style={{ border: "1px solid var(--vm-border)", background: "var(--vm-card)", color: "var(--vm-faint)" }}
        >
          Nenhuma vistoria encontrada.
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {filtradas.map((v) => {
            const estado = estadoDaVistoria(v.situacao_id, !!v.tecnico_nome);
            const cor = corDoEstado(estado);
            const semAcoes = !v.tecnico_nome && v.situacao_id <= 1;
            const bg = bgDoEstado(estado);
            return (
              <div
                key={v.id}
                className="relative flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5"
                style={{
                  background: "var(--vm-card)",
                  border: "1px solid var(--vm-border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.06)",
                }}
              >
                {bg && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat dark:hidden"
                      style={{ backgroundImage: `url('${asset(bg.light)}')` }}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 z-0 hidden bg-cover bg-center bg-no-repeat dark:block"
                      style={{ backgroundImage: `url('${asset(bg.dark)}')` }}
                    />
                    <div className="pointer-events-none absolute inset-0 z-0 bg-white/88 dark:bg-black/88" />
                  </>
                )}

                {/* faixa de situação */}
                <div className="relative z-10" style={{ height: 3, background: cor, flexShrink: 0 }} />

                <div className="relative z-10 flex flex-1 flex-col p-4">
                  {/* equipamento + badge */}
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[14px] font-bold" style={{ color: "var(--vm-text)" }} title={v.equipamento}>
                        {v.equipamento}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                        <MapPin className="h-3 w-3 shrink-0" />
                        {v.municipio ?? "—"}
                      </p>
                    </div>
                    <SituacaoBadge estado={estado} />
                  </div>

                  {/* técnico + data */}
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: "var(--vm-muted)" }}>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      {v.tecnico_nome ?? <span style={{ color: "var(--vm-faint)" }}>sem técnico</span>}
                    </span>
                    {v.data_vistoria && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {new Date(v.data_vistoria).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>

                  {/* ações */}
                  <div className="mt-auto flex items-center gap-1.5 pt-3" style={{ borderTop: "1px solid var(--vm-border-soft)" }}>
                    {v.tecnico_nome && (
                      <button
                        type="button"
                        onClick={() => { setReatrib(v); setNovoTecnico(""); setMotivo(""); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#3B82F6", 0.35)}`, background: tintOnCard("#3B82F6", 0.12), color: "#3B82F6" }}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Reatribuir
                      </button>
                    )}
                    {/* Desatribuir aparece enquanto o técnico ainda NÃO
                        começou o trabalho de campo: ATRIBUÍDO (A_VISTORIAR +
                        tem técnico) e EM DESLOCAMENTO (a caminho, nada
                        registrado ainda). Item com progresso real (situação
                        3/6/8 etc.) usa Reatribuir/Devolver, que preservam o
                        histórico em vez de zerar. */}
                    {(v.situacao_id === 1 || v.situacao_id === 7) && v.tecnico_nome && (
                      <button
                        type="button"
                        onClick={() => setDesatribuindo(v)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#6B7280", 0.35)}`, background: tintOnCard("#6B7280", 0.12), color: "#6B7280" }}
                      >
                        <X className="h-3.5 w-3.5" />
                        Desatribuir
                      </button>
                    )}
                    {(v.situacao_id === 3 || v.situacao_id === 6) && (
                      <button
                        type="button"
                        onClick={() => {
                          resetDevolverState();
                          setDevolvendo(v);
                        }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#D97706", 0.4)}`, background: tintOnCard("#D97706", 0.14), color: "#D97706" }}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Devolver
                      </button>
                    )}
                    {/* Cancelar é admin-only — moderador tem o resto do escopo do admin aqui. */}
                    {session?.role === "admin" && v.situacao_id > 1 && (
                      <button
                        type="button"
                        onClick={() => { setCancelando(v); setCancelConfirm(""); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:brightness-95"
                        style={{ border: `1px solid ${tint("#DC2626", 0.35)}`, background: tintOnCard("#DC2626", 0.12), color: "#DC2626" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    )}
                    {semAcoes && (
                      <span className="text-[11px]" style={{ color: "var(--vm-faint)" }}>Sem ações disponíveis</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Cancelar */}
      {cancelando && (
        <ModalShell>
          <div className="mb-4 flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: tint("#DC2626", 0.15), color: "#DC2626" }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Cancelar vistoria</h2>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--vm-muted)" }}>
                Esta ação é irreversível. A situação volta para <strong>A Vistoriar</strong>, o técnico é desvinculado e todos os arquivos (fotos, vídeos, PDF) são deletados.
              </p>
            </div>
          </div>
          <div className="mb-4 rounded-xl px-3 py-2 text-[12px]" style={{ background: "var(--vm-fill)" }}>
            <span className="font-semibold" style={{ color: "var(--vm-text-soft)" }}>{cancelando.equipamento}</span>
            {cancelando.municipio && <span className="ml-2" style={{ color: "var(--vm-faint)" }}>{cancelando.municipio}</span>}
          </div>
          <p className="mb-2 text-[12px]" style={{ color: "var(--vm-muted)" }}>
            Digite <strong style={{ color: "var(--vm-text)" }}>CANCELAR</strong> para confirmar:
          </p>
          <input
            value={cancelConfirm}
            onChange={(e) => setCancelConfirm(e.target.value)}
            placeholder="CANCELAR"
            className="mb-4 w-full rounded-xl px-3 py-2 text-[13px] outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCancelando(null)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={cancelConfirm !== "CANCELAR" || cancelLoading}
              onClick={handleCancelar}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {cancelLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Confirmar cancelamento
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal Reatribuir */}
      {reatrib && (
        <ModalShell>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: tint("#3B82F6", 0.15), color: "#3B82F6" }}
              >
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Reatribuir vistoria</h2>
                <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>{reatrib.equipamento}</p>
              </div>
            </div>
            <button type="button" onClick={() => setReatrib(null)} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {reatrib.tecnico_nome && (
            <div
              className="mb-3 rounded-xl px-3 py-2 text-[12px]"
              style={{ background: tint("#D97706", 0.13), color: "#D97706" }}
            >
              Técnico atual: <strong>{reatrib.tecnico_nome}</strong>
            </div>
          )}

          <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Novo técnico</label>
          <div className="relative mb-3">
            <select
              value={novoTecnico}
              onChange={(e) => setNovoTecnico(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full appearance-none rounded-xl py-2 pl-3 pr-8 text-[13px] outline-none focus:border-blue-400"
              style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
            >
              <option value="">Selecione um técnico…</option>
              {tecnicos.map((t) => (
                <option key={t.users_id} value={t.users_id}>
                  {t.nome} {t.status_operacional !== "offline" ? "●" : "○"}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: "var(--vm-faint)" }}
            />
          </div>

          <label className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--vm-text-soft)" }}>Motivo da reatribuição *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Técnico anterior em licença médica…"
            rows={3}
            className="mb-4 w-full resize-none rounded-xl px-3 py-2 text-[12px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            style={{ ...fieldStyle, border: `1px solid ${fieldStyle.borderColor}` }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReatrib(null)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!novoTecnico || !motivo.trim() || reatribLoading}
              onClick={handleReatribuir}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {reatribLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirmar reatribuição
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal Desatribuir */}
      {desatribuindo && (
        <ModalShell>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: tint("#6B7280", 0.15), color: "#6B7280" }}
              >
                <X className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: "var(--vm-text)" }}>Desatribuir vistoria</h2>
                <p className="text-[11px]" style={{ color: "var(--vm-muted)" }}>{desatribuindo.equipamento}</p>
              </div>
            </div>
            <button type="button" onClick={() => setDesatribuindo(null)} style={{ color: "var(--vm-faint)" }}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="mb-4 rounded-xl px-3 py-2.5 text-[12px]"
            style={{ background: tint("#6B7280", 0.1), color: "var(--vm-text-soft)" }}
          >
            Tira <strong>{desatribuindo.tecnico_nome}</strong> desse poste e volta pra fila, sem técnico.
            O poste continua com o histórico dele (fotos, devoluções, recusas) — isso só desvincula quem está responsável agora.
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDesatribuindo(null)}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{ border: "1px solid var(--vm-border)", color: "var(--vm-text-soft)" }}
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={desatribuirLoading}
              onClick={handleDesatribuir}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
              style={{ background: "#6B7280" }}
            >
              {desatribuirLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Confirmar desatribuição
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal Devolver — design premium dark (glassmorphism) */}
      {devolvendo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(11,13,17,0.75)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[20px] border"
            style={{
              background: "rgba(22,24,29,0.97)",
              borderColor: "rgba(255,255,255,0.08)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between gap-4 px-6 pb-5 pt-7 sm:px-8"
              style={{ background: "linear-gradient(180deg, rgba(22,24,29,1) 65%, rgba(22,24,29,0))" }}
            >
              <button
                type="button"
                onClick={resetDevolverState}
                aria-label="Voltar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition duration-200 hover:-translate-y-0.5"
                style={{
                  borderColor: tint(DEV_ORANGE, 0.35),
                  background: tint(DEV_ORANGE, 0.12),
                  boxShadow: `0 0 20px ${tint(DEV_ORANGE, 0.2)}`,
                }}
              >
                <ArrowLeft className="h-4.5 w-4.5" style={{ color: DEV_ORANGE }} />
              </button>

              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="text-[24px] font-bold leading-tight sm:text-[34px]" style={{ color: "#F4F4F5" }}>
                  Devolver para correção
                </h2>
                <p className="mt-1.5 text-[13px]" style={{ color: "#9CA3AF" }}>
                  Vamos enviar a fila de{" "}
                  <span className="font-semibold" style={{ color: DEV_ORANGE }}>
                    {devolvendo.tecnico_nome ?? "técnico responsável"}
                  </span>{" "}
                  para correção.
                </p>
              </div>

              <button
                type="button"
                onClick={resetDevolverState}
                aria-label="Fechar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/5"
              >
                <X className="h-5 w-5" style={{ color: "#9CA3AF" }} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-2 sm:px-8">
              <DevCard title="O QUE ESTÁ ERRADO?" description="Fotos e vídeo que precisam ser refeitos no local do equipamento.">
                {DEVOLUCAO_ITENS.filter((i) => i.tipo === "foto").map((i) => (
                  <DevCheckCard
                    key={i.key}
                    label={i.label}
                    checked={devItens.includes(i.key)}
                    onToggle={() => toggleDevItem(i.key)}
                    icon={FOTO_ICON[i.key] ?? ImageIcon}
                    accent={DEV_PURPLE}
                  />
                ))}
              </DevCard>

              <DevCard title="CAMPOS DO FORMULÁRIO" description="Informações que precisam ser corrigidas — não exige deslocamento por padrão.">
                {DEVOLUCAO_ITENS.filter((i) => i.tipo === "campo").map((i) => (
                  <DevCheckCard
                    key={i.key}
                    label={i.label}
                    checked={devItens.includes(i.key)}
                    onToggle={() => toggleDevItem(i.key)}
                    icon={CAMPO_ICON[i.key] ?? FileText}
                    accent={DEV_ORANGE}
                  />
                ))}
              </DevCard>

              <DevCard title="MOTIVO" description="Selecione um ou mais motivos da devolução.">
                {DEVOLUCAO_MOTIVOS.map((m) => (
                  <DevCheckCard
                    key={m}
                    label={m}
                    checked={devMotivos.includes(m)}
                    onToggle={() => toggleDevMotivo(m)}
                    icon={MOTIVO_ICON[m] ?? AlertCircle}
                    accent={DEV_RED}
                  />
                ))}
              </DevCard>

              {devMotivos.includes("Outro") && (
                <textarea
                  value={devMotivoOutro}
                  onChange={(e) => setDevMotivoOutro(e.target.value)}
                  placeholder="Descreva o motivo…"
                  rows={2}
                  className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none transition focus:ring-1"
                  style={{
                    background: "#1B1E24",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#F4F4F5",
                  }}
                />
              )}

              {precisaDeslocFlag != null && (
                precisaDeslocFlag ? (
                  <p
                    className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12px] font-medium"
                    style={{ border: `1px solid ${tint(DEV_ORANGE, 0.35)}`, background: tint(DEV_ORANGE, 0.1), color: DEV_ORANGE }}
                  >
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Vai exigir deslocamento até o equipamento (tem item de foto/vídeo apontado).</span>
                  </p>
                ) : (
                  <p
                    className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12px] font-medium"
                    style={{ border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.1)", color: "#34D399" }}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Correção só de formulário — não exige deslocamento por padrão.</span>
                  </p>
                )
              )}

              {/* Print da operadora ruim pode significar que o poste vistoriado
                  está errado — dá pra corrigir a localização aqui em vez de
                  depender do técnico digitar certo na tela de correção. */}
              {mostrarMudarPoste && (
                <div
                  className="rounded-xl border px-3.5 py-3"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                >
                  <button
                    type="button"
                    onClick={() => setDevPosteOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 text-[12.5px] font-semibold"
                    style={{ color: "#D4D4D8" }}
                  >
                    <span className="flex items-center gap-2">
                      <MapPinOff className="h-4 w-4" style={{ color: DEV_ORANGE }} />
                      Poste errado? Corrigir localização
                    </span>
                    <ChevronDown
                      className="h-3.5 w-3.5 shrink-0 transition-transform"
                      style={{ transform: devPosteOpen ? "rotate(180deg)" : "none" }}
                    />
                  </button>

                  {devPosteOpen && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {devPosteLoading ? (
                        <p className="col-span-2 py-2 text-[11.5px]" style={{ color: "#9CA3AF" }}>
                          Carregando localização atual…
                        </p>
                      ) : (
                        <>
                          <input
                            value={devPsPosteNovo}
                            onChange={(e) => setDevPsPosteNovo(e.target.value)}
                            placeholder="PS do poste"
                            className="col-span-2 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none sm:col-span-1"
                            style={{ background: "#1B1E24", border: "1px solid rgba(255,255,255,0.08)", color: "#F4F4F5" }}
                          />
                          <input
                            value={devEnderecoNovo}
                            onChange={(e) => setDevEnderecoNovo(e.target.value)}
                            placeholder="Endereço"
                            className="col-span-2 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none sm:col-span-1"
                            style={{ background: "#1B1E24", border: "1px solid rgba(255,255,255,0.08)", color: "#F4F4F5" }}
                          />
                          <input
                            value={devLatNovo}
                            onChange={(e) => setDevLatNovo(e.target.value)}
                            placeholder="Latitude"
                            inputMode="decimal"
                            className="rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none"
                            style={{ background: "#1B1E24", border: "1px solid rgba(255,255,255,0.08)", color: "#F4F4F5" }}
                          />
                          <input
                            value={devLngNovo}
                            onChange={(e) => setDevLngNovo(e.target.value)}
                            placeholder="Longitude"
                            inputMode="decimal"
                            className="rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none"
                            style={{ background: "#1B1E24", border: "1px solid rgba(255,255,255,0.08)", color: "#F4F4F5" }}
                          />
                        </>
                      )}
                      <p className="col-span-2 text-[10.5px]" style={{ color: "#9CA3AF" }}>
                        Só é salvo se algum valor for realmente alterado.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Redirecionar pra outro técnico — nem sempre quem devolveu consegue resolver (mudou de rota, saiu). */}
              <label
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] font-medium transition"
                style={{
                  borderColor: devOutroTecnico ? tint(DEV_PURPLE, 0.5) : "rgba(255,255,255,0.08)",
                  background: devOutroTecnico ? tint(DEV_PURPLE, 0.12) : "rgba(255,255,255,0.03)",
                  color: devOutroTecnico ? "#F4F4F5" : "#D4D4D8",
                }}
              >
                <input
                  type="checkbox"
                  checked={devOutroTecnico}
                  onChange={(e) => {
                    setDevOutroTecnico(e.target.checked);
                    if (!e.target.checked) setDevNovoTecnicoId("");
                  }}
                  className="h-4 w-4 shrink-0 rounded"
                  style={{ accentColor: DEV_PURPLE }}
                />
                Devolver para outro técnico (o atual não consegue resolver)
              </label>

              {devOutroTecnico && (
                <div className="relative">
                  <select
                    value={devNovoTecnicoId}
                    onChange={(e) => setDevNovoTecnicoId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full appearance-none rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none"
                    style={{ background: "#1B1E24", border: "1px solid rgba(255,255,255,0.08)", color: "#F4F4F5" }}
                  >
                    <option value="">Selecione o técnico…</option>
                    {tecnicos
                      .filter((t) => t.users_id !== devolvendo?.tecnico_id)
                      .map((t) => (
                        <option key={t.users_id} value={t.users_id}>
                          {t.nome} {t.status_operacional !== "offline" ? "●" : "○"}
                        </option>
                      ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                    style={{ color: "#9CA3AF" }}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex gap-3 px-6 pb-6 pt-4 sm:px-8"
              style={{ background: "linear-gradient(0deg, rgba(22,24,29,1) 70%, rgba(22,24,29,0))" }}
            >
              <button
                type="button"
                onClick={resetDevolverState}
                className="flex-1 rounded-2xl border py-3.5 text-[13.5px] font-semibold transition duration-200 hover:bg-white/5"
                style={{ borderColor: "rgba(255,255,255,0.12)", color: "#D4D4D8" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  devItens.length === 0 ||
                  devMotivos.length === 0 ||
                  (devMotivos.includes("Outro") && !devMotivoOutro.trim()) ||
                  (devOutroTecnico && !devNovoTecnicoId) ||
                  devLoading
                }
                onClick={handleDevolver}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[13.5px] font-bold text-white transition duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: `linear-gradient(90deg, ${DEV_ORANGE}, #FF3D81)`,
                  boxShadow: devLoading ? "none" : "0 10px 28px rgba(255,61,129,0.35)",
                }}
              >
                {devLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Confirmar devolução
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
