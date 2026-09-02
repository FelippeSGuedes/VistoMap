import type { Metadata } from "next";
import { PoliticaPrivacidadeContent } from "@/components/legal/PoliticaPrivacidadeContent";

export const metadata: Metadata = {
  title: "Política de Privacidade",
};

// Rota pública — sem autenticação. O bypass do gate de sessão do painel
// está em client-layout.tsx (PUBLIC_PAINEL_PATHS).
export default function PainelPoliticaPrivacidadePage() {
  return <PoliticaPrivacidadeContent />;
}
