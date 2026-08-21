"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search, UserPlus, Users } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { PERFIL_CFG, initials, ConfigHeader } from "../_shared";
import type { UsuarioPainel, PerfilUsuario } from "@/app/api/painel/usuarios/route";

type Filtro = "todos" | PerfilUsuario;
const FILTROS: Filtro[] = ["todos", "Administrador", "Moderador", "Leitura", "Técnico"];

export default function ColaboradoresPage() {
  const { session } = useAuthStore();
  const isAdmin = session?.role === "admin";
  const [analistas, setAnalistas] = useState<UsuarioPainel[]>([]);
  const [tecnicos, setTecnicos] = useState<UsuarioPainel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

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

  const todos = useMemo(() => [...analistas, ...tecnicos], [analistas, tecnicos]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todos.filter((u) => {
      if (filtro !== "todos" && u.perfil !== filtro) return false;
      if (!q) return true;
      return (
        u.nome.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [todos, query, filtro]);

  const contagemPorFiltro = useMemo(() => {
    const m = new Map<Filtro, number>();
    m.set("todos", todos.length);
    for (const f of FILTROS) {
      if (f === "todos") continue;
      m.set(f, todos.filter((u) => u.perfil === f).length);
    }
    return m;
  }, [todos]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <ConfigHeader icon={Users} title="Colaboradores" subtitle="Técnicos e analistas — perfil e status de acesso." />
        {isAdmin && (
          <Link
            href="/painel/configuracoes/novo"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#00B388] px-3.5 text-[12.5px] font-semibold text-white transition hover:bg-[#00875F]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Novo colaborador
          </Link>
        )}
      </div>

      {/* toolbar: busca + filtro de perfil */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div
          className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background: "#fff", border: "1px solid var(--vm-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}
        >
          <Search className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={2.2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, usuário ou e-mail…"
            className="flex-1 bg-transparent text-[13px] font-medium text-gray-800 outline-none"
          />
        </div>
        <div
          className="flex items-center gap-1 overflow-x-auto rounded-2xl px-2 py-1.5"
          style={{ background: "#fff", border: "1px solid var(--vm-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}
        >
          {FILTROS.map((f) => {
            const active = filtro === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition"
                style={{
                  background: active ? "var(--vm-accent-tint)" : "transparent",
                  color: active ? "#00875F" : "var(--vm-muted)",
                }}
              >
                {f === "todos" ? "Todos" : f}
                <span className="rounded-full bg-black/5 px-1.5 text-[9.5px] font-bold">
                  {contagemPorFiltro.get(f) ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="rounded-2xl bg-white p-2"
        style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      >
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-8 text-[13px] text-gray-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filtrados.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-gray-400">Nenhum colaborador encontrado.</p>
        ) : (
          <ul className="space-y-1">
            {filtrados.map((u) => {
              const pcfg = PERFIL_CFG[u.perfil] ?? PERFIL_CFG.Leitura;
              return (
                <li
                  key={`${u.perfil}-${u.id}`}
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
