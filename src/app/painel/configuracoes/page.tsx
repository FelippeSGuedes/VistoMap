"use client";

/**
 * /painel/configuracoes — Configurações operacionais.
 *
 * Abas:
 *  - Expediente: janela de rastreio automático.
 *  - Usuários: técnicos e analistas (perfil + status, read-only) e, pros
 *    analistas, o flag de notificação (web push) que o ADMIN liga/desliga.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  Clock,
  Mail,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import type { UsuarioPainel } from "@/app/api/painel/usuarios/route";

type AcessoPainel = "tecnico" | "administrador" | "moderador" | "leitura" | "nenhum";
interface PerfilGlpi { id: number; nome: string }
interface OpcaoAcesso { key: AcessoPainel; label: string }

interface ExpedienteConfig {
  inicio: string;
  fim: string;
  fimDeSemana: boolean;
}

type Aba = "expediente" | "usuarios";
type SubAba = "analistas" | "tecnicos";

const PERFIL_CFG: Record<string, { bg: string; fg: string }> = {
  Administrador: { bg: "var(--vm-accent-tint)", fg: "#00875F" },
  Moderador: { bg: "var(--vm-indigo-tint)", fg: "#4338CA" },
  Leitura: { bg: "var(--vm-tile-3)", fg: "#475569" },
  Técnico: { bg: "rgba(37,99,235,0.10)", fg: "#2563EB" },
};

function initials(nome: string) {
  const p = nome.trim().split(/[\s._-]+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

export default function ConfiguracoesPage() {
  const { session } = useAuthStore();
  const isAdmin = session?.role === "admin";
  const [aba, setAba] = useState<Aba>("expediente");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--vm-accent-tint)", color: "#00875F" }}
        >
          <Settings className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">Configurações</h1>
          <p className="text-[13px] text-gray-500">Regras operacionais e usuários do sistema.</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 rounded-xl bg-[var(--vm-fill)] p-1">
        {([["expediente", "Expediente", Clock], ["usuarios", "Usuários", Users]] as const).map(
          ([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAba(key)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition"
              style={{
                background: aba === key ? "#fff" : "transparent",
                color: aba === key ? "#00875F" : "var(--vm-muted)",
                boxShadow: aba === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        )}
      </div>

      {aba === "expediente" ? <ExpedienteCard /> : <UsuariosCard isAdmin={isAdmin} />}
    </div>
  );
}

/* ─── Aba Expediente ──────────────────────────────────────────────────── */

function ExpedienteCard() {
  const { session } = useAuthStore();
  const [config, setConfig] = useState<ExpedienteConfig | null>(null);
  const [inicio, setInicio] = useState("07:30");
  const [fim, setFim] = useState("18:00");
  const [fimDeSemana, setFimDeSemana] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const fetchConfig = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const r = await api.get<{ config: ExpedienteConfig }>("/painel/expediente/config", { headers });
      setConfig(r.data.config);
      setInicio(r.data.config.inicio);
      setFim(r.data.config.fim);
      setFimDeSemana(r.data.config.fimDeSemana);
    } catch {
      /* mantém defaults */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const alterado =
    !!config &&
    (config.inicio !== inicio || config.fim !== fim || config.fimDeSemana !== fimDeSemana);

  async function handleSave() {
    if (inicio >= fim) {
      setErro("O horário de início deve ser antes do horário de fim.");
      return;
    }
    setErro(null);
    setSaving(true);
    setSaved(false);
    try {
      const r = await api.put<{ config: ExpedienteConfig }>(
        "/painel/expediente/config",
        { inicio, fim, fimDeSemana },
        { headers }
      );
      setConfig(r.data.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Falha ao salvar.";
      setErro(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      <div className="mb-1 flex items-center gap-2">
        <Clock className="h-4 w-4" style={{ color: "#00B388" }} />
        <h2 className="text-[15px] font-bold text-gray-900">Expediente automático</h2>
      </div>
      <p className="mb-5 text-[12.5px] leading-relaxed text-gray-500">
        O app não tem mais botão de iniciar/pausar/finalizar — o rastreio de
        localização abre sozinho quando o técnico usa o app dentro da janela
        abaixo, e fecha sozinho fora dela. É contínuo (sem pausa de almoço).
        Fora da janela e nos fins de semana (salvo se ativado abaixo), o app
        não coleta GPS e não permite iniciar vistorias.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-gray-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Início</label>
              <input
                type="time"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] font-semibold text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Fim</label>
              <input
                type="time"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] font-semibold text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
              />
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl bg-[var(--vm-fill)] px-3.5 py-3">
            <div>
              <p className="text-[13px] font-semibold text-gray-800">Rastrear em fins de semana</p>
              <p className="text-[11.5px] text-gray-500">Desligado por padrão (sábado e domingo sem rastreio).</p>
            </div>
            <input
              type="checkbox"
              checked={fimDeSemana}
              onChange={(e) => setFimDeSemana(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[#00B388]"
            />
          </label>

          {erro && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {erro}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!alterado || saving}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00B388] py-3 text-[13px] font-bold text-white transition hover:bg-[#00875F] disabled:opacity-40"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Salvo" : "Salvar alterações"}
          </button>
        </>
      )}
    </div>
  );
}

/* ─── Aba Usuários ────────────────────────────────────────────────────── */

function UsuariosCard({ isAdmin }: { isAdmin: boolean }) {
  const { session } = useAuthStore();
  const [sub, setSub] = useState<SubAba>("analistas");
  const [analistas, setAnalistas] = useState<UsuarioPainel[]>([]);
  const [tecnicos, setTecnicos] = useState<UsuarioPainel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const carregar = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const r = await api.get<{ analistas: UsuarioPainel[]; tecnicos: UsuarioPainel[] }>(
        "/painel/usuarios",
        { headers }
      );
      setAnalistas(r.data.analistas);
      setTecnicos(r.data.tecnicos);
    } catch {
      /* ignora */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleNotificar(u: UsuarioPainel) {
    if (!isAdmin) return;
    const novo = !u.notificar;
    setSavingId(u.id);
    // otimista
    setAnalistas((prev) => prev.map((a) => (a.id === u.id ? { ...a, notificar: novo } : a)));
    try {
      await api.put(`/painel/usuarios/${u.id}/notificar`, { notificar: novo }, { headers });
    } catch {
      // reverte
      setAnalistas((prev) => prev.map((a) => (a.id === u.id ? { ...a, notificar: !novo } : a)));
    } finally {
      setSavingId(null);
    }
  }

  const lista = sub === "analistas" ? analistas : tecnicos;

  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      {/* sub-abas */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-[var(--vm-fill)] p-0.5">
          {([["analistas", "Analistas", analistas.length], ["tecnicos", "Técnicos", tecnicos.length]] as const).map(
            ([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSub(key)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition"
                style={{
                  background: sub === key ? "#fff" : "transparent",
                  color: sub === key ? "#00875F" : "var(--vm-muted)",
                  boxShadow: sub === key ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {label}
                <span className="rounded-full bg-[var(--vm-fill-2)] px-1.5 text-[10px] font-bold text-[var(--vm-faint)]">{n}</span>
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[#00B388] px-3 text-[12px] font-semibold text-white transition hover:bg-[#00875F]"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Novo colaborador
            </button>
          )}
          <button
            type="button"
            onClick={carregar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100"
            title="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {sub === "analistas" && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-[var(--vm-fill)] px-3 py-2.5 text-[11.5px] leading-relaxed text-gray-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#00B388" }} />
          <span>
            Quem você ligar aqui recebe <strong>notificação no navegador</strong> (recusa,
            exceção, vistoria concluída, devolução) — mesmo com a aba do painel em segundo
            plano. O aviso só chega depois que o usuário abre o painel logado uma vez
            (o navegador dele pede permissão nesse momento).
          </span>
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-[13px] text-gray-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : lista.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-gray-400">Nenhum usuário neste grupo.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((u) => {
            const pcfg = PERFIL_CFG[u.perfil] ?? PERFIL_CFG.Leitura;
            return (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-[var(--vm-fill)]"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                  style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
                >
                  {initials(u.nome)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-gray-900">{u.nome}</span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: pcfg.bg, color: pcfg.fg }}
                    >
                      {u.perfil}
                    </span>
                    {!u.ativo && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-gray-500">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-gray-400">{u.email ?? u.username}</p>
                </div>

                {/* toggle de notificação — só analistas, só admin edita */}
                {sub === "analistas" && (
                  <div className="flex shrink-0 items-center gap-2">
                    {u.notificar && (
                      <span className="hidden text-[10px] text-gray-400 sm:inline">
                        {u.navegadores && u.navegadores > 0
                          ? `${u.navegadores} navegador${u.navegadores !== 1 ? "es" : ""}`
                          : "aguardando login"}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!isAdmin || savingId === u.id}
                      onClick={() => toggleNotificar(u)}
                      title={
                        !isAdmin
                          ? "Só o administrador pode alterar"
                          : u.notificar
                          ? "Desativar notificações"
                          : "Ativar notificações"
                      }
                      className="relative flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50"
                      style={{ background: u.notificar ? "#00B388" : "var(--vm-fill-2)" }}
                    >
                      <span
                        className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-all"
                        style={{ left: u.notificar ? 22 : 2 }}
                      >
                        {savingId === u.id ? (
                          <RefreshCw className="h-2.5 w-2.5 animate-spin text-gray-400" />
                        ) : u.notificar ? (
                          <Bell className="h-2.5 w-2.5" style={{ color: "#00875F" }} />
                        ) : (
                          <BellOff className="h-2.5 w-2.5 text-gray-400" />
                        )}
                      </span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {novoOpen && (
        <NovoColaboradorModal
          onClose={() => setNovoOpen(false)}
          onCriado={() => { setNovoOpen(false); carregar(); }}
        />
      )}
    </div>
  );
}

/* ─── Modal: novo colaborador ─────────────────────────────────────────── */

function NovoColaboradorModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const { session } = useAuthStore();
  const headers = { Authorization: `Bearer ${session?.token}` };

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTocado, setUsernameTocado] = useState(false);
  const [email, setEmail] = useState("");
  const [matricula, setMatricula] = useState("");
  const [acesso, setAcesso] = useState<AcessoPainel>("tecnico");
  const [profileId, setProfileId] = useState<number | "">("");
  const [forcarTroca, setForcarTroca] = useState(false);
  const [perfis, setPerfis] = useState<PerfilGlpi[]>([]);
  const [acessos, setAcessos] = useState<OpcaoAcesso[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<{ username: string; emailEnviado: boolean } | null>(null);

  // Carrega perfis do GLPI + opções de acesso.
  useEffect(() => {
    api
      .get<{ perfis: PerfilGlpi[]; acessos: OpcaoAcesso[] }>("/painel/usuarios/opcoes", { headers })
      .then((r) => {
        setPerfis(r.data.perfis);
        setAcessos(r.data.acessos);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login padrão nome.sobrenome (sem acento), até o admin editar manualmente.
  const slug = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const usernameAuto = [slug(nome.split(/\s+/)[0] ?? ""), slug(sobrenome.split(/\s+/).pop() ?? "")]
    .filter(Boolean)
    .join(".");
  const usernameFinal = usernameTocado ? username : usernameAuto;

  const senhaPreview = matricula.trim() ? `Nsn#${matricula.trim()}2026` : "Nsn#…2026";

  async function submit() {
    setErro(null);
    setSaving(true);
    try {
      const r = await api.post<{ username: string; emailEnviado: boolean }>(
        "/painel/usuarios/criar",
        { nome, sobrenome, username: usernameFinal, email, matricula, acesso, profileId, forcarTroca },
        { headers }
      );
      setOk({ username: r.data.username, emailEnviado: r.data.emailEnviado });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Falha ao criar a conta.";
      setErro(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6"
        style={{ border: "1px solid var(--vm-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--vm-accent-tint)", color: "#00875F" }}>
              <UserPlus className="h-5 w-5" />
            </span>
            <h2 className="text-[16px] font-bold text-gray-900">Novo colaborador</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {ok ? (
          <div className="space-y-4 py-2 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </span>
            <div>
              <p className="text-[14px] font-bold text-gray-900">Conta criada!</p>
              <p className="mt-1 text-[12.5px] text-gray-500">
                Login <b>{ok.username}</b> · senha <b>Nsn#{matricula.trim()}2026</b>
              </p>
            </div>
            <div
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] ${ok.emailEnviado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              <Mail className="h-4 w-4 shrink-0" />
              {ok.emailEnviado
                ? "E-mail com as credenciais enviado."
                : "Conta criada, mas o e-mail NÃO foi enviado — passe as credenciais manualmente."}
            </div>
            <button
              type="button"
              onClick={onCriado}
              className="w-full rounded-xl bg-[#00B388] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#00875F]"
            >
              Concluir
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nome" value={nome} onChange={setNome} placeholder="João" />
              <Campo label="Sobrenome" value={sobrenome} onChange={setSobrenome} placeholder="Silva" />
            </div>
            <Campo
              label="E-mail"
              value={email}
              onChange={setEmail}
              placeholder="joao.silva@nansen.com.br"
              type="email"
            />
            <div>
              <Campo
                label="Usuário (login)"
                value={usernameFinal}
                onChange={(v) => { setUsername(v.toLowerCase()); setUsernameTocado(true); }}
                placeholder="joao.silva"
              />
              <p className="mt-1 text-[11px] text-gray-400">Gerado como <b>nome.sobrenome</b> — dá pra editar.</p>
            </div>
            <div>
              <Campo label="Matrícula" value={matricula} onChange={setMatricula} placeholder="4521" />
              <p className="mt-1 text-[11px] text-gray-400">Senha gerada: <b className="font-mono text-gray-600">{senhaPreview}</b></p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Perfil (GLPI)</label>
                <div className="relative">
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-[13px] font-medium text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
                  >
                    <option value="">Selecione…</option>
                    {perfis.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Acesso VistoMap</label>
                <div className="relative">
                  <select
                    value={acesso}
                    onChange={(e) => setAcesso(e.target.value as AcessoPainel)}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-[13px] font-medium text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
                  >
                    {acessos.map((a) => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              O <b>Perfil</b> é o papel dentro do GLPI. O <b>Acesso VistoMap</b> define o grupo (app/painel) — escolha <b>Nenhum</b> para conta só de GLPI.
            </p>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[var(--vm-fill)] px-3.5 py-3">
              <input
                type="checkbox"
                checked={forcarTroca}
                onChange={(e) => setForcarTroca(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#00B388]"
              />
              <div>
                <p className="text-[12.5px] font-semibold text-gray-800">Forçar troca de senha no 1º login</p>
                <p className="text-[11px] leading-snug text-gray-500">A pessoa entra com a senha padrão e o GLPI obriga a definir uma nova na hora. Recomendado (a senha padrão é previsível).</p>
              </div>
            </label>

            {erro && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {erro}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={saving || !nome || !sobrenome || !usernameFinal || !email || !matricula || !profileId}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00B388] py-3 text-[13px] font-bold text-white transition hover:bg-[#00875F] disabled:opacity-40"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Criar conta e enviar e-mail
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
      />
    </div>
  );
}
