"use client";

/**
 * Home do módulo de Instalação — mapa/lista dos postes com states_id =
 * LIBERADO PARA INSTALAÇÃO (mais os que o instalador logado já assumiu).
 * Página nova e isolada; não reaproveita src/app/vistorias/page.tsx nem
 * nenhum componente exclusivo dela — só primitivos genéricos (MapListToggle,
 * Button, Card) e o hook de geolocalização já existente.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Inbox, LogOut, MapPin, Navigation, RefreshCcw, Wrench } from "lucide-react";
import { MapListToggle } from "@/components/vistorias/MapListToggle";
import { Card } from "@/components/ui/Card";
import { InstalacaoExecucaoSheet } from "@/components/instalacoes/InstalacaoExecucaoSheet";
import { NavigationOptionsSheet } from "@/components/vistorias/NavigationOptionsSheet";
import { useInstalacoesStore } from "@/store/instalacoes";
import { useAuthStore } from "@/store/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { cn } from "@/utils/cn";

const InstalacaoMapView = dynamic(
  () => import("@/components/instalacoes/InstalacaoMapView").then((m) => m.InstalacaoMapView),
  { ssr: false }
);

const STATE_LIBERADO = 3;
const STATE_EM_INSTALACAO = 4;

export default function InstalacaoPage() {
  const router = useRouter();
  const { hydrated, session, logout } = useAuthStore();
  const { items, loading, fetchAll, selectedId, setSelected, patchItem, removeItem } =
    useInstalacoesStore();
  const [view, setView] = useState<"map" | "list">("map");
  const [navTarget, setNavTarget] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const { position } = useGeolocation(true, true);

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(() => {
    if (session) void fetchAll();
  }, [session, fetchAll]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const meuUserId = Number(session?.tecnico.id ?? 0);

  const disponiveis = items.filter((i) => i.statusGeralId === STATE_LIBERADO).length;
  const minhas = items.filter((i) => i.statusGeralId === STATE_EM_INSTALACAO && i.instalador?.id === meuUserId).length;

  if (!hydrated || !session) return null;

  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-brand-ice">
      <header className="z-10 flex items-center justify-between border-b border-brand-steel/50 bg-white px-4 py-3 shadow-soft">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-emerald/12 text-brand-emerald">
            <Wrench className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="text-[14.5px] font-bold leading-tight text-ink">Instalação</h1>
            <p className="text-[11px] text-ink-muted">
              {disponiveis} disponíve{disponiveis === 1 ? "l" : "is"} · {minhas} sua{minhas === 1 ? "" : "s"} em andamento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void fetchAll()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-brand-steel/40"
            aria-label="Atualizar"
          >
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-brand-steel/40"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {view === "map" ? (
          <InstalacaoMapView
            instalacoes={items}
            userPosition={position}
            selectedId={selectedId}
            onSelect={setSelected}
            className="h-full w-full"
          />
        ) : (
          <div className="h-full space-y-2.5 overflow-y-auto p-4 pb-28">
            {items.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-ink-muted">
                <Inbox className="h-8 w-8" />
                <p className="text-[13px] font-medium">Nenhuma instalação disponível agora.</p>
              </div>
            )}
            {items.map((item) => {
              const ehMinha = item.instalador?.id === meuUserId;
              return (
                <motion.div
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelected(item.id);
                  }}
                  className="block w-full cursor-pointer text-left"
                >
                  <Card className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-ink">{item.equipamento}</p>
                      <p className="flex items-center gap-1 text-[11.5px] text-ink-muted">
                        <MapPin className="h-3 w-3 shrink-0" /> {item.contexto.municipio || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide",
                          item.statusGeralId === STATE_LIBERADO
                            ? "bg-brand-emerald/12 text-brand-emerald"
                            : ehMinha
                              ? "bg-brand-deep/10 text-brand-deep"
                              : "bg-status-rejected/10 text-status-rejected"
                        )}
                      >
                        {item.statusGeralId === STATE_LIBERADO ? "Liberado" : ehMinha ? "Minha" : "Em uso"}
                      </span>
                      {item.latitude != null && item.longitude != null && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setNavTarget({ lat: item.latitude!, lng: item.longitude!, label: item.equipamento });
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-brand-deep hover:bg-brand-steel/40"
                          aria-label="Navegar até o local"
                        >
                          <Navigation className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <MapListToggle view={view} onChange={setView} />
      </div>

      <InstalacaoExecucaoSheet
        instalacao={selected}
        meuUserId={meuUserId}
        onClose={() => setSelected(null)}
        onAssumida={(atualizada) => patchItem(atualizada.id, atualizada)}
        onFinalizada={(id) => removeItem(id)}
        onRejeitada={(id) => removeItem(id)}
      />

      {navTarget && (
        <NavigationOptionsSheet
          open={!!navTarget}
          onClose={() => setNavTarget(null)}
          lat={navTarget.lat}
          lng={navTarget.lng}
          label={navTarget.label}
        />
      )}
    </main>
  );
}
