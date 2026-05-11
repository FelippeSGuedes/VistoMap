"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/utils/format";
import type { FilterState, VistoriaPriority, VistoriaStatus } from "@/types";

interface FiltersBottomSheetProps {
  open: boolean;
  onClose: () => void;
  initial: FilterState;
  categorias: string[];
  onApply: (next: FilterState) => void;
  onReset: () => void;
}

const STATUSES: VistoriaStatus[] = [
  "PENDENTE",
  "EM_CAMPO",
  "FINALIZADA",
  "REPROVADA",
  "APROVADA",
];
const PRIORITIES: VistoriaPriority[] = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];
const ORDERS = [
  { id: "distancia", label: "Distância" },
  { id: "prioridade", label: "Prioridade" },
  { id: "data", label: "Data" },
] as const;

export function FiltersBottomSheet({
  open,
  onClose,
  initial,
  categorias,
  onApply,
  onReset,
}: FiltersBottomSheetProps) {
  const [draft, setDraft] = useState<FilterState>(initial);

  const toggle = <K extends keyof FilterState>(key: K, value: FilterState[K] extends Array<infer T> ? T : never) => {
    setDraft((d) => {
      const list = d[key] as Array<typeof value>;
      const exists = list.includes(value);
      const next = exists ? list.filter((v) => v !== value) : [...list, value];
      return { ...d, [key]: next };
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filtros & ordenação"
      description="Refine sua lista operacional"
      footer={
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              onReset();
              setDraft(initial);
            }}
          >
            Limpar
          </Button>
          <Button
            size="lg"
            fullWidth
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Aplicar filtros
          </Button>
        </div>
      }
    >
      <section className="space-y-5">
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Status
          </h4>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Pill
                key={s}
                active={draft.status.includes(s)}
                onClick={() => toggle("status", s)}
              >
                {STATUS_LABEL[s]}
              </Pill>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Prioridade
          </h4>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <Pill
                key={p}
                active={draft.prioridade.includes(p)}
                onClick={() => toggle("prioridade", p)}
              >
                {PRIORITY_LABEL[p]}
              </Pill>
            ))}
          </div>
        </div>

        {categorias.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Categorias
            </h4>
            <div className="flex flex-wrap gap-2">
              {categorias.map((c) => (
                <Pill
                  key={c}
                  active={draft.categorias.includes(c)}
                  onClick={() => toggle("categorias", c)}
                >
                  {c}
                </Pill>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Distância máxima
            </h4>
            <span className="text-sm font-semibold text-ink">{draft.distanciaMaxKm} km</span>
          </div>
          <input
            type="range"
            min={5}
            max={300}
            step={5}
            value={draft.distanciaMaxKm}
            onChange={(e) =>
              setDraft((d) => ({ ...d, distanciaMaxKm: Number(e.target.value) }))
            }
            className="w-full accent-brand-emerald"
          />
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Ordenar por
          </h4>
          <div className="flex flex-wrap gap-2">
            {ORDERS.map((o) => (
              <Pill
                key={o.id}
                active={draft.ordenacao === o.id}
                onClick={() => setDraft((d) => ({ ...d, ordenacao: o.id }))}
              >
                {o.label}
              </Pill>
            ))}
          </div>
        </div>
      </section>
    </BottomSheet>
  );
}
