"use client";

import { motion } from "framer-motion";
import { Logo } from "@/components/icons/Logo";

interface LoadingShellProps {
  label?: string;
}

export function LoadingShell({ label = "Carregando" }: LoadingShellProps) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-grad-hero text-white">
      <div className="flex flex-col items-center gap-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <Logo variant="light" />
        </motion.div>
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand-emerald/70" />
            <span className="relative h-2 w-2 rounded-full bg-brand-emerald" />
          </span>
          {label}…
        </div>
      </div>
    </div>
  );
}
