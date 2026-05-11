import { cn } from "@/utils/cn";

interface LogoProps {
  className?: string;
  withWordmark?: boolean;
  variant?: "light" | "dark";
}

export function Logo({ className, withWordmark = true, variant = "dark" }: LogoProps) {
  const ink = variant === "dark" ? "#073B4C" : "#F8F9FA";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-grad-emerald shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d="M12 3.5c-3.6 0-6.5 2.9-6.5 6.5 0 4.7 6.5 11 6.5 11s6.5-6.3 6.5-11c0-3.6-2.9-6.5-6.5-6.5Z"
            fill="#FFD166"
          />
          <circle cx="12" cy="10" r="2.4" fill="#073B4C" />
        </svg>
      </span>
      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: ink }}
          >
            VistoMap
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand-emerald">
            Field Ops
          </span>
        </span>
      )}
    </div>
  );
}
