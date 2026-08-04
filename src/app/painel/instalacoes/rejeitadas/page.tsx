"use client";

/**
 * Central de Instalações › Rejeitadas — instalações que o instalador
 * rejeitou em campo, aguardando o analista decidir se escala pra vistoria
 * (correção) ou descarta (libera de novo pra instalação). Tela nova,
 * espelha o padrão visual de /painel/rejeitadas mas lê da fila própria do
 * módulo de Instalação.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Ban, RotateCw, Undo2 } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";

interface InstalacaoRejeicao {
  id: number;
  items_id: number;
  equipamento: string;
  instalador_id: number;
  instalador_nome: string;
  motivo: string;
  justificativa: string;
  foto1Url: string | null;
  foto2Url: string | null;
  foto3Url: string | null;
  status: "PENDENTE" | "ESCALADO" | "DESCARTADO";
  criado_em: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const fieldStyle = { background: "var(--vm-tile)", borderColor: "var(--vm-border)", color: "var(--vm-text)" } as const;

export default function InstalacoesRejeitadasPage() {
  const { session } = useAuthStore();
  const [itens, setItens] = useState<InstalacaoRejeicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidindoId, setDecidindoId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const { data } = await api.get<{ rejeicoes: InstalacaoRejeicao[] }>("/painel/instalacoes/rejeitadas");
      setItens(data.rejeicoes);
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function decidir(id: number, acao: "escalar" | "descartar") {
    setDecidindoId(id);
    try {
      await api.post(`/painel/instalacoes/rejeitadas/${id}/decidir`, { acao });
      setItens((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setDecidindoId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
          <Ban className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[17px] font-bold" style={{ color: "var(--vm-text)" }}>
            Instalações Rejeitadas
          </h1>
          <p className="text-[12.5px]" style={{ color: "var(--vm-text-muted)" }}>
            Aguardando decisão: escalar pra vistoria ou descartar a rejeição
          </p>
        </div>
      </header>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--vm-text-muted)" }}>Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="rounded-2xl border p-10 text-center" style={fieldStyle}>
          <p className="text-[13.5px] font-medium">Nenhuma instalação rejeitada pendente.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {itens.map((item) => (
            <div key={item.id} className="rounded-2xl border p-4" style={fieldStyle}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[14px] font-bold">{item.equipamento}</p>
                  <p className="text-[12px]" style={{ color: "var(--vm-text-muted)" }}>
                    Rejeitada por {item.instalador_nome} em {fmtDate(item.criado_em)}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide"
                  style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}
                >
                  {item.motivo}
                </span>
              </div>

              <p className="mt-2.5 text-[13px] leading-relaxed">{item.justificativa}</p>

              {(item.foto1Url || item.foto2Url || item.foto3Url) && (
                <div className="mt-3 flex gap-2">
                  {[item.foto1Url, item.foto2Url, item.foto3Url].filter(Boolean).map((url, i) => (
                    <a
                      key={i}
                      href={url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border"
                      style={{ borderColor: "var(--vm-border)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url!} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                        <ArrowUpRight className="h-4 w-4 text-white" />
                      </span>
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => void decidir(item.id, "escalar")}
                  disabled={decidindoId === item.id}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold text-white transition disabled:opacity-60"
                  style={{ background: "#B45309" }}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Escalar pra Vistoria
                </button>
                <button
                  onClick={() => void decidir(item.id, "descartar")}
                  disabled={decidindoId === item.id}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold text-white transition disabled:opacity-60"
                  style={{ background: "#00875F" }}
                >
                  <RotateCw className="h-3.5 w-3.5" /> Descartar (liberar de novo)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
