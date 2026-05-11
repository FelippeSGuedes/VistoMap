"use client";

import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/utils/cn";

interface MobileMapShellProps {
  map: ReactNode;
  list: ReactNode;
  initial?: "map" | "split" | "list";
}

const SNAPS = {
  map: 0.18,
  split: 0.5,
  list: 0.82,
} as const;

export function MobileMapShell({ map, list, initial = "split" }: MobileMapShellProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  const sheetY = useMotionValue(0);
  const [snap, setSnap] = useState<keyof typeof SNAPS>(initial);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const update = () => {
      if (wrapperRef.current) setHeight(wrapperRef.current.clientHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!height) return;
    sheetY.set(SNAPS[snap] * height);
  }, [snap, height, sheetY]);

  const opacity = useTransform(sheetY, (y) => {
    if (!height) return 1;
    const r = 1 - y / height;
    return Math.max(0.4, Math.min(1, r + 0.2));
  });

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setDragging(false);
    const y = sheetY.get();
    const ratio = y / height;
    const velocity = info.velocity.y;
    let target: keyof typeof SNAPS = snap;
    if (velocity < -300) target = ratio > 0.55 ? "split" : "map";
    else if (velocity > 300) target = ratio < 0.4 ? "split" : "list";
    else if (ratio < 0.32) target = "map";
    else if (ratio < 0.66) target = "split";
    else target = "list";
    setSnap(target);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative h-[calc(100dvh-0px)] overflow-hidden bg-brand-ice"
    >
      <motion.div
        className="absolute inset-0"
        style={{ opacity }}
      >
        {map}
      </motion.div>

      <motion.div
        drag="y"
        dragConstraints={{
          top: SNAPS.map * height,
          bottom: SNAPS.list * height,
        }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        animate={{ y: SNAPS[snap] * height }}
        transition={{
          type: "spring",
          stiffness: 320,
          damping: 34,
          mass: 0.7,
        }}
        className={cn(
          "absolute inset-x-0 top-0 z-20 rounded-t-3xl bg-white shadow-sheet will-change-transform",
          "border-t border-brand-steel/60",
          dragging && "transition-none"
        )}
        style={{ y: sheetY, height: `calc(100% + 24px)` }}
      >
        <div className="flex flex-col items-center gap-1 pb-1 pt-2.5">
          <span className="h-1.5 w-12 rounded-full bg-brand-steel" />
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
            onClick={() =>
              setSnap((s) => (s === "list" ? "split" : s === "split" ? "map" : "list"))
            }
          >
            <ChevronUp
              className={cn(
                "h-3 w-3 transition",
                snap === "list" && "rotate-180"
              )}
            />
            Arraste para ajustar
          </button>
        </div>
        <div
          className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+96px)]"
          style={{ height: `calc(100% - 32px)` }}
        >
          {list}
        </div>
      </motion.div>
    </div>
  );
}
