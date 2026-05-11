import { Badge } from "@/components/ui/Badge";
import { PRIORITY_LABEL } from "@/utils/format";
import type { VistoriaPriority } from "@/types";

const TONE: Record<VistoriaPriority, Parameters<typeof Badge>[0]["tone"]> = {
  BAIXA: "neutral",
  MEDIA: "neutral",
  ALTA: "amber",
  CRITICA: "red",
};

export function PriorityBadge({ priority }: { priority: VistoriaPriority }) {
  return <Badge tone={TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}
