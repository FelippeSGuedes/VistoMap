"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Smartphone, Unlink } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { ConfigHeader, initials } from "../_shared";

interface BindingRow {
  id: number;
  users_id: number;
  tecnico_nome: string;
  device_id: string;
  device_model: string | null;
  matricula_confirmada: string | null;
  aceito_em: string;
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function DispositivosPage() {
  const { session } = useAuthStore();
  const [rows, setRows] = useState<BindingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [revogando, setRevogando] = useState<number | null>(null);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const carregar = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const r = await api.get<BindingRow[]>("/painel/dispositivos", { headers });
      setRows(r.data);
    } catch {
      /* ignora */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.tecnico_nome.toLowerCase().includes(q) ||
        (r.matricula_confirmada ?? "").toLowerCase().includes(q) ||
        (r.device_model ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const revogar = async (row: BindingRow) => {
    const ok = window.confirm(
      `Liberar novo aparelho para ${row.tecnico_nome}?\n\nO vínculo atual (${row.device_model ?? "aparelho sem modelo identificado"}) será revogado — o técnico vai precisar reativar em /liberar-acesso no próximo login.`
    );
    if (!ok) return;
    setRevogando(row.id);
    try {
      await api.post(`/painel/dispositivos/${row.id}/revogar`, {}, { headers });
      await carregar();
    } catch {
      window.alert("Falha ao revogar o vínculo. Tente de novo.");
    } finally {
      setRevogando(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ConfigHeader
        icon={Smartphone}
        title="Dispositivos"
        subtitle="Aparelhos vinculados por técnico — libere um novo quando trocar de celular."
      />

      <div
        className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5"
        style={{ background: "#fff", border: "1px solid var(--vm-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}
      >
        <Search className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={2.2} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por técnico, matrícula ou aparelho…"
          className="flex-1 bg-transparent text-[13px] font-medium text-gray-800 outline-none"
        />
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
          <p className="py-8 text-center text-[12.5px] text-gray-400">
            Nenhum aparelho vinculado ainda.
          </p>
        ) : (
          <ul className="space-y-1">
            {filtrados.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-[var(--vm-fill)]"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                  style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
                >
                  {initials(r.tecnico_nome)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-gray-900">{r.tecnico_nome}</span>
                    {r.matricula_confirmada && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-gray-500">
                        {r.matricula_confirmada}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-gray-400">
                    {r.device_model ?? "Aparelho sem modelo identificado"} · vinculado em {fmtData(r.aceito_em)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={revogando === r.id}
                  onClick={() => revogar(r)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  {revogando === r.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" />
                  )}
                  Liberar novo aparelho
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
