"use client";

import { asset } from "@/utils/asset";

/**
 * Tela de carregamento do mapa — aparece no PRIMEIRO carregamento (até os
 * equipamentos estarem posicionados) e ao trocar o estilo do mapa. Nunca no
 * poll de 5s: piscar a cada ciclo seria pior que não ter nada.
 *
 * Adaptada da tela do zabbmap pra identidade VistoMap: radar e barra em
 * verde-esmeralda, wordmark em duas cores e o logo flutuando no centro.
 */
export function MapaLoading({
  visivel,
  equipamentos,
  tecnicos,
}: {
  visivel: boolean;
  equipamentos?: number;
  tecnicos?: number;
}) {
  if (!visivel) return null;
  const temContagem = equipamentos != null && equipamentos > 0;
  return (
    <div className="vm-ld absolute inset-0 z-[240] flex items-center justify-center">
      <div className="vm-ld-stack">
        <div className="vm-ld-radar">
          <span className="vm-ld-ring" />
          <span className="vm-ld-ring" />
          <span className="vm-ld-ring" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="vm-ld-logo" src={asset("/logo-vistomap.png")} alt="" width={78} height={93} />
          <span className="vm-ld-sombra" />
        </div>
        <p className="vm-ld-wm">
          Visto<b>Map</b>
        </p>
        <p className="vm-ld-lbl">Carregando equipamentos</p>
        <span className="vm-ld-bar">
          <i />
        </span>
        {temContagem && (
          <p className="vm-ld-sub">
            posicionando {equipamentos} equipamentos
            {tecnicos != null && tecnicos > 0 ? ` · ${tecnicos} técnicos` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
