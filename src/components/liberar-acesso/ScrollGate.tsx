"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Libera `children` (ex.: botão "Aceito") só depois que o usuário rolar o
 * conteúdo até o fim. Não existia padrão pra isso no projeto — feito à
 * mão: mede scrollHeight/scrollTop/clientHeight com uma margem pequena
 * (o navegador às vezes fecha a conta com 1-2px de sobra e nunca bateria
 * exato).
 */
export function ScrollGate({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: (rolouAteOFim: boolean) => ReactNode;
  className?: string;
}) {
  const [rolouAteOFim, setRolouAteOFim] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const MARGEM_PX = 24;
    const chegouAoFim =
      el.scrollHeight - el.scrollTop - el.clientHeight <= MARGEM_PX;
    if (chegouAoFim) setRolouAteOFim(true);
  };

  return (
    <div className={className}>
      <div
        ref={ref}
        onScroll={handleScroll}
        className="max-h-[52vh] overflow-y-auto overscroll-contain rounded-2xl border border-brand-steel/50 bg-white p-4"
      >
        {content}
      </div>
      {children(rolouAteOFim)}
    </div>
  );
}
