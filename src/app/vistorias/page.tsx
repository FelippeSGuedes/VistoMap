"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Compass, Inbox, Search } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { SearchHeader } from "@/components/vistorias/SearchHeader";
import { FiltersBottomSheet } from "@/components/vistorias/FiltersBottomSheet";
import { MapListToggle } from "@/components/vistorias/MapListToggle";
import { VistoriaCard } from "@/components/vistorias/VistoriaCard";
import { VistoriaListSkeleton } from "@/components/vistorias/VistoriaListSkeleton";
import { MobileMapShell } from "@/components/vistorias/MobileMapShell";
import { VistoriaPinSheet } from "@/components/vistorias/VistoriaPinSheet";
import { VistoriaExecucaoSheet } from "@/components/vistorias/VistoriaExecucaoSheet";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LocationPermissionModal } from "@/components/feedback/LocationPermissionModal";
import { useVistoriasStore } from "@/store/vistorias";
import { useAuthStore } from "@/store/auth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { useFilteredVistorias } from "@/hooks/useFilteredVistorias";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { STATUS_LABEL } from "@/utils/format";
import type { VistoriaStatus } from "@/types";

const MapView = dynamic(
  () => import("@/components/vistorias/MapView").then((m) => m.MapView),
  { ssr: false }
);

const QUICK_STATUSES: VistoriaStatus[] = ["PENDENTE", "EM_CAMPO", "FINALIZADA"];

export default function VistoriasPage() {
  const router = useRouter();
  const { hydrated, session } = useAuthStore();
  const { items, loading, fetchAll, filters, setFilters, resetFilters, selectedId, setSelected } =
    useVistoriasStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [view, setView] = useState<"map" | "list">("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [permissionDismissed, setPermissionDismissed] = useState(false);
  const { position, refresh: refreshGeo } = useGeolocation(false);
  const permission = useLocationPermission();

  // Quando o usuário concede a permissão (no modal ou via banner do browser),
  // dispara automaticamente a leitura do GPS.
  useEffect(() => {
    if (permission.state === "granted") {
      refreshGeo();
    }
  }, [permission.state, refreshGeo]);

  const showPermissionModal =
    !permissionDismissed &&
    (permission.state === "prompt" ||
      permission.state === "denied" ||
      permission.state === "unsupported" ||
      permission.state === "insecure");

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useFilteredVistorias({
    vistorias: items,
    filters,
    origin: position ? { lat: position.lat, lng: position.lng } : null,
  });

  const categorias = useMemo(
    () =>
      Array.from(
        new Set(items.map((v) => v.categoria).filter((c): c is string => Boolean(c)))
      ),
    [items]
  );

  const filterCount =
    (filters.status.length ? 1 : 0) +
    (filters.prioridade.length ? 1 : 0) +
    (filters.categorias.length ? 1 : 0) +
    (filters.distanciaMaxKm < 100 ? 1 : 0);

  const list = (
    <div className="space-y-3 pt-2">
      <header className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            {filtered.length} vistorias
          </h2>
          <p className="text-xs text-ink-muted">
            Ordenado por {filters.ordenacao === "distancia" ? "distância" : filters.ordenacao}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (permission.state === "granted") {
              refreshGeo();
            } else {
              setPermissionDismissed(false);
            }
          }}
          className="flex items-center gap-1 rounded-full bg-brand-emerald/12 px-3 py-1.5 text-[12px] font-semibold text-brand-emerald"
        >
          <Compass className="h-3.5 w-3.5" />
          Recentralizar
        </button>
      </header>
      {loading && filtered.length === 0 ? (
        <VistoriaListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nenhuma vistoria encontrada"
          description="Ajuste os filtros ou aproxime-se da área de cobertura para visualizar ordens disponíveis."
          actionLabel="Limpar filtros"
          onAction={resetFilters}
        />
      ) : (
        <motion.div layout className="space-y-3">
          {filtered.map((v) => (
            <VistoriaCard
              key={v.id}
              vistoria={v}
              highlighted={v.id === selectedId}
              onSelect={(item) => setSelected(item.id)}
            />
          ))}
        </motion.div>
      )}
    </div>
  );

  const map = (
    <MapView
      vistorias={filtered}
      userPosition={position ? { lat: position.lat, lng: position.lng } : null}
      selectedId={selectedId}
      onSelect={setSelected}
      className="h-full w-full"
    />
  );

  const pills = (
    <>
      <Pill
        active={filters.status.length === 0}
        onClick={() => setFilters({ status: [] })}
      >
        Todas
      </Pill>
      {QUICK_STATUSES.map((s) => (
        <Pill
          key={s}
          active={filters.status.includes(s)}
          onClick={() =>
            setFilters({
              status: filters.status.includes(s)
                ? filters.status.filter((x) => x !== s)
                : [...filters.status, s],
            })
          }
        >
          {STATUS_LABEL[s]}
        </Pill>
      ))}
      {categorias.slice(0, 6).map((c) => (
        <Pill
          key={c}
          active={filters.categorias.includes(c)}
          onClick={() =>
            setFilters({
              categorias: filters.categorias.includes(c)
                ? filters.categorias.filter((x) => x !== c)
                : [...filters.categorias, c],
            })
          }
        >
          {c}
        </Pill>
      ))}
    </>
  );

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-brand-ice">
      <SearchHeader
        query={filters.query}
        onQuery={(query) => setFilters({ query })}
        onOpenFilters={() => setFiltersOpen(true)}
        filterCount={filterCount}
        pills={pills}
      />

      {isDesktop ? (
        <main className="grid flex-1 grid-cols-[360px_1fr] gap-0">
          <aside className="flex max-h-[calc(100dvh-128px)] flex-col overflow-y-auto border-r border-brand-steel/60 bg-white/60 px-4 pb-10">
            {list}
          </aside>
          <div className="relative h-[calc(100dvh-128px)]">{map}</div>
        </main>
      ) : (
        <div className="flex-1">
          {view === "map" ? (
            <MobileMapShell map={map} list={list} />
          ) : (
            <main className="px-4 pb-32 pt-3">{list}</main>
          )}
          <MapListToggle view={view} onChange={setView} />
        </div>
      )}

      <FiltersBottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        initial={filters}
        categorias={categorias}
        onApply={setFilters}
        onReset={resetFilters}
      />

      <VistoriaPinSheet
        open={!!selectedId && !executingId}
        vistoria={items.find((v) => v.id === selectedId) ?? null}
        onClose={() => setSelected(null)}
        onStart={(v) => {
          setSelected(null);
          setExecutingId(v.id);
        }}
      />

      <VistoriaExecucaoSheet
        open={!!executingId}
        vistoriaId={executingId}
        onClose={() => {
          setExecutingId(null);
          fetchAll();
        }}
      />

      <LocationPermissionModal
        open={showPermissionModal}
        state={permission.state}
        requesting={permission.requesting}
        error={permission.error}
        onAllow={async () => {
          const pos = await permission.request();
          if (pos) {
            setPermissionDismissed(true);
            await refreshGeo();
          }
        }}
        onDismiss={() => setPermissionDismissed(true)}
      />

      {filtered.length === 0 && filters.query && !loading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-32 mx-auto w-fit rounded-full bg-brand-deep/90 px-4 py-2 text-xs text-white shadow-elev">
          <span className="inline-flex items-center gap-1">
            <Search className="h-3.5 w-3.5" />
            Sem resultados para "{filters.query}"
          </span>
        </div>
      )}
    </div>
  );
}
