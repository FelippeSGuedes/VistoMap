"use client";

import { motion } from "framer-motion";
import { List, Map } from "lucide-react";

interface MapListToggleProps {
  view: "map" | "list";
  onChange: (view: "map" | "list") => void;
}

export function MapListToggle({ view, onChange }: MapListToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(view === "map" ? "list" : "map")}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+96px)] left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-brand-deep px-5 text-sm font-semibold text-white shadow-elev"
    >
      <motion.span
        key={view}
        initial={{ rotate: -10, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
      >
        {view === "map" ? <List className="h-4 w-4" /> : <Map className="h-4 w-4" />}
      </motion.span>
      {view === "map" ? "Lista" : "Mapa"}
    </button>
  );
}
