"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { NOTIF_CATEGORIAS, CATEGORIA_META, type NotifCategoria } from "@/lib/notifCategorias";
import { PERFIL_CFG, initials, ConfigHeader } from "../_shared";
import type { UsuarioPainel } from "@/app/api/painel/usuarios/route";

export default function NotificacoesConfigPage() {
  const { session } = useAuthStore();
  const isAdmin = session?.role === "admin";
  const [analistas, setAnalistas] = useState<UsuarioPainel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${session?.token}` };

  const carregar = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const r = await api.get<{ analistas: UsuarioPainel[] }>("/painel/usuarios", { headers });
      setAnalistas(r.data.analistas);
    } catch {
      /* ignora */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleCategoria(u: UsuarioPainel, categoria: NotifCategoria) {
    if (!isAdmin) return;
    const atual = u.categorias?.[categoria] ?? false;
    const novo = !atual;
    const key = `${u.id}:${categoria}`;
    setSavingKey(key);
    setAnalistas((prev) =>
      prev.map((a) =>
        a.id === u.id
          ? { ...a, categorias: { ...(a.categorias as Record<NotifCategoria, boolean>), [categoria]: novo } }
          : a
      )
    );
    try {
      await api.put(`/painel/usuarios/${u.id}/notificar`, { categoria, ativo: novo }, { headers });
    } catch {
      setAnalistas((prev) =>
        prev.map((a) =>
          a.id === u.id
            ? { ...a, categorias: { ...(a.categorias as Record<NotifCategoria, boolean>), [categoria]: atual } }
            : a
        )
      );
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ConfigHeader
        icon={Bell}
        title="Notificações"
        subtitle="Quais tipos de evento disparam notificação no navegador de cada analista."
      />

      <p className="flex items-start gap-2 rounded-2xl bg-[var(--vm-fill)] px-4 py-3 text-[12px] leading-relaxed text-gray-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#00B388" }} />
        <span>
          Cada coluna é um tipo de evento. Clique num círculo pra ligar/desligar aquela
          categoria pra aquele analista — mesmo com a aba do painel em segundo plano. O
          aviso só chega depois que a pessoa abre o painel logada uma vez (o navegador
          dela pede permissão nesse momento).
        </span>
      </p>

      <div
        className="overflow-x-auto rounded-2xl bg-white"
        style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      >
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-[13px] text-gray-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : analistas.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-gray-400">Nenhum analista cadastrado.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr style={{ background: "var(--vm-fill)" }}>
                <th className="min-w-[200px] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  Analista
                </th>
                {NOTIF_CATEGORIAS.map((categoria) => {
                  const meta = CATEGORIA_META[categoria];
                  const Icon = meta.icon;
                  return (
                    <th key={categoria} className="w-[92px] px-2 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Icon className="h-3.5 w-3.5" style={{ color: meta.fg }} />
                        <span className="text-[9.5px] font-bold uppercase leading-tight tracking-wide text-gray-500">
                          {meta.label}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {analistas.map((u, i) => {
                const pcfg = PERFIL_CFG[u.perfil] ?? PERFIL_CFG.Leitura;
                return (
                  <tr
                    key={u.id}
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--vm-border)" }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10.5px] font-bold text-white"
                          style={{ background: "linear-gradient(145deg,#00B388,#00875F)" }}
                        >
                          {initials(u.nome)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-semibold text-gray-900">{u.nome}</span>
                            <span
                              className="shrink-0 rounded-full px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-wide"
                              style={{ background: pcfg.bg, color: pcfg.fg }}
                            >
                              {u.perfil}
                            </span>
                          </div>
                          <p className="truncate text-[10.5px] text-gray-400">
                            {Object.values(u.categorias ?? {}).some(Boolean)
                              ? u.navegadores && u.navegadores > 0
                                ? `${u.navegadores} navegador${u.navegadores !== 1 ? "es" : ""}`
                                : "aguardando login"
                              : "sem notificações ativas"}
                          </p>
                        </div>
                      </div>
                    </td>
                    {NOTIF_CATEGORIAS.map((categoria) => {
                      const meta = CATEGORIA_META[categoria];
                      const Icon = meta.icon;
                      const ativo = u.categorias?.[categoria] ?? false;
                      const key = `${u.id}:${categoria}`;
                      return (
                        <td key={categoria} className="px-2 py-3 text-center">
                          <button
                            type="button"
                            disabled={!isAdmin || savingKey === key}
                            onClick={() => toggleCategoria(u, categoria)}
                            title={
                              !isAdmin
                                ? "Só o administrador pode alterar"
                                : `${meta.label}: ${ativo ? "ativado" : "desativado"}`
                            }
                            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-50"
                            style={{ background: ativo ? meta.bg : "var(--vm-fill-2)" }}
                          >
                            {savingKey === key ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-gray-400" />
                            ) : (
                              <Icon className="h-3.5 w-3.5" style={{ color: ativo ? meta.fg : "#9CA3AF" }} />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
