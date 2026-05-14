"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Lock } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";

interface EditableFieldProps {
  label: string;
  value: string | number | null | undefined;
  placeholder?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
  multiline?: boolean;
  icon?: ReactNode;
  suffix?: string;
  /** Em uma grid 2 colunas, ocupa toda a linha. */
  colSpan?: boolean;
}

export function EditableField({
  label,
  value,
  placeholder,
  onChange,
  readOnly,
  multiline,
  icon,
  suffix,
  colSpan,
}: EditableFieldProps) {
  const id = useId();
  const safe = value == null ? "" : String(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(safe);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(safe);
  }, [safe, editing]);

  useEffect(() => {
    if (!editing) return;
    if (multiline) textareaRef.current?.focus();
    else inputRef.current?.focus();
  }, [editing, multiline]);

  const commit = () => {
    if (draft !== safe) onChange?.(draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(safe);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
  };

  const isEmpty = safe.trim().length === 0;
  const interactive = !readOnly;

  return (
    <div
      onClick={() => {
        if (!editing && interactive) setEditing(true);
      }}
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-white/80 px-3.5 py-2.5 transition",
        "border-brand-steel/70",
        interactive
          ? "cursor-text hover:border-brand-emerald/70 hover:bg-white"
          : "cursor-default opacity-95",
        editing && "border-brand-emerald shadow-glow bg-white",
        colSpan && "col-span-2"
      )}
    >
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted"
      >
        {icon && <span className="text-ink-muted/80">{icon}</span>}
        {label}
        {readOnly && <Lock className="ml-1 h-3 w-3 text-ink-muted/60" />}
      </label>

      <AnimatePresence initial={false} mode="wait">
        {editing ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-0.5"
          >
            {multiline ? (
              <textarea
                ref={textareaRef}
                id={id}
                value={draft}
                placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                rows={3}
                className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-ink placeholder:text-ink-muted/60 focus:outline-none"
              />
            ) : (
              <input
                ref={inputRef}
                id={id}
                value={draft}
                placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-[14px] font-medium text-ink placeholder:text-ink-muted/60 focus:outline-none"
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-0.5 flex items-center justify-between gap-2"
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[14px] font-medium",
                isEmpty ? "text-ink-muted/60 italic" : "text-ink"
              )}
            >
              {isEmpty ? placeholder ?? "—" : safe}
              {!isEmpty && suffix ? (
                <span className="ml-1 text-ink-muted">{suffix}</span>
              ) : null}
            </span>
            {interactive && (
              <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-muted/0 transition group-hover:text-brand-emerald" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
