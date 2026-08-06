"use client";

/**
 * Selo "GIOC · Perfil X" — usado nos headers do app de campo (Vistoria e
 * Instalação) pra deixar explícito qual módulo/perfil a sessão atual é,
 * espelhando a marca "Central GIOC" já usada no painel administrativo
 * (src/app/painel/client-layout.tsx). Primitivo genérico de UI — sem
 * lógica de negócio, seguro pros dois módulos importarem.
 */

interface AppBrandLockupProps {
  perfil: "Vistoria" | "Instalação";
}

export function AppBrandLockup({ perfil }: AppBrandLockupProps) {
  const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return (
    <div className="mt-[3px] flex items-center gap-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BP}/logo-vistomap.png`} alt="" className="h-3 w-3 object-contain" />
      <span className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: "#7A8896" }}>
        GIOC
      </span>
      <span className="h-[3px] w-[3px] rounded-full" style={{ background: "#00B388" }} />
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#00B388" }}>
        Perfil {perfil}
      </span>
    </div>
  );
}
