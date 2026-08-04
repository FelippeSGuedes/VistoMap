"use client";

/**
 * Mapa/lista do módulo de Instalação — postes com states_id = LIBERADO
 * PARA INSTALAÇÃO (mais os que o instalador logado já assumiu). Página
 * nova e isolada; não reaproveita src/app/vistorias/page.tsx nem nenhum
 * componente exclusivo dela — só primitivos genéricos (MapListToggle,
 * Button, Card) e o hook de geolocalização já existente.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, Inbox, MapPin, Navigation, RefreshCcw } from "lucide-react";
import { MapListToggle } from "@/components/vistorias/MapListToggle";
import { Card } from "@/components/ui/Card";
import { InstalacaoExecucaoSheet } from "@/components/instalacoes/InstalacaoExecucaoSheet";
import { InstalacaoBottomNav } from "@/components/instalacoes/InstalacaoBottomNav";
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

function InstalacaoMapaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hydrated, session } = useAuthStore();
  const { items, loading, fetchAll, selectedId, setSelected, patchItem, removeItem } =
    useInstalacoesStore();
  const [view, setView] = useState<"map" | "list">(searchParams.get("view") === "list" ? "list" : "map");
  const [navTarget, setNavTarget] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const { position } = useGeolocation(true, true);
  const municipioFiltro = searchParams.get("municipio");

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(() => {
    if (session) void fetchAll();
  }, [session, fetchAll]);

  const itemsFiltrados = useMemo(() => {
    if (!municipioFiltro) return items;
    return items.filter((i) => i.contexto.municipio.toLowerCase() === municipioFiltro.toLowerCase());
  }, [items, municipioFiltro]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const meuUserId = Number(session?.tecnico.id ?? 0);

  if (!hydrated || !session) return null;

  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-brand-ice">
      <header className="z-10 flex items-center gap-2.5 border-b border-brand-steel/50 bg-white px-3 py-3 shadow-soft">
        <button
          onClick={() => router.push("/instalacao")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-brand-steel/40"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-[14.5px] font-bold text-ink">Instalações liberadas</h1>
          {municipioFiltro && (
            <button
              onClick={() => router.replace("/instalacao/mapa")}
              className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-emerald/12 px-2 py-0.5 text-[10.5px] font-semibold text-brand-emerald"
            >
              {municipioFiltro} <span className="text-brand-emerald/70">✕</span>
            </button>
          )}
        </div>
        <button
          onClick={() => void fetchAll()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-brand-steel/40"
          aria-label="Atualizar"
        >
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden pb-20">
        {view === "map" ? (
          <InstalacaoMapView
            instalacoes={itemsFiltrados}
            userPosition={position}
            selectedId={selectedId}
            onSelect={setSelected}
            className="h-full w-full"
          />
        ) : (
          <div className="h-full space-y-2.5 overflow-y-auto p-4 pb-28">
            {itemsFiltrados.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-ink-muted">
                <Inbox className="h-8 w-8" />
                <p className="text-[13px] font-medium">Nenhuma instalação disponível agora.</p>
              </div>
            )}
            {itemsFiltrados.map((item) => {
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

      <InstalacaoBottomNav />

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

export default function InstalacaoMapaPage() {
  return (
    <Suspense fallback={null}>
      <InstalacaoMapaInner />
    </Suspense>
  );
}
