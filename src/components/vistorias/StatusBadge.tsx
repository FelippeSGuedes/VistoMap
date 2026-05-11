import { Badge } from "@/components/ui/Badge";
import { STATUS_LABEL } from "@/utils/format";
import type { VistoriaStatus } from "@/types";

const TONE: Record<VistoriaStatus, Parameters<typeof Badge>[0]["tone"]> = {
  PENDENTE: "amber",
  EM_CAMPO: "blue",
  FINALIZADA: "emerald",
  REPROVADA: "red",
  APROVADA: "deep",
};

export function StatusBadge({ status }: { status: VistoriaStatus }) {
  return (
    <Badge tone={TONE[status]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
