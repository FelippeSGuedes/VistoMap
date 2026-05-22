/**
 * Versão client-safe do classificador de motivos.
 * Mesma logica do server (lib/glpi/motivos.ts) mas sem `server-only`.
 *
 * Usado em UI: tag de categoria nos cards de revisita.
 */

export type MotivoCategoriaId =
  | "POSTE_TROCA"
  | "ALTURA_ANTENA"
  | "ATERRAMENTO"
  | "CABEAMENTO"
  | "INSTALACAO"
  | "DOCUMENTACAO"
  | "DADOS_GPS"
  | "EQUIPAMENTO"
  | "ALIMENTACAO"
  | "OUTROS";

interface CategoriaDef {
  id: MotivoCategoriaId;
  label: string;
  short: string;
  color: string;
  keywords: string[];
  excludes?: string[];
}

const CATEGORIAS: CategoriaDef[] = [
  {
    id: "POSTE_TROCA",
    label: "Troca / identificação de poste",
    short: "Poste",
    color: "#F97316",
    keywords: [
      "psposte", "ps poste", "ps-poste",
      "poste incorreto", "poste errado", "poste trocado",
      "trocou o poste", "trocou de poste", "trocar poste",
      "id do poste", "numero do poste", "n do poste",
      "identificacao do poste", "poste nao confere",
    ],
  },
  {
    id: "ALTURA_ANTENA",
    label: "Altura da antena / poste",
    short: "Altura",
    color: "#3B82F6",
    keywords: [
      "altura", "alturada", "antena baixa", "antena alta",
      "antena mal posicionada", "altura insuficiente",
      "altura incorreta", "altura errada", "metro da antena",
      "fora da altura", "fora de altura",
    ],
  },
  {
    id: "ATERRAMENTO",
    label: "Aterramento",
    short: "Aterramento",
    color: "#EAB308",
    keywords: [
      "aterramento", "aterramt", "fio terra", "fio-terra",
      "cabo terra", "cabo-terra", "sem aterramento",
      "falta aterramento", "aterrar", "aterrado",
      "nao aterrado", "haste de terra",
    ],
  },
  {
    id: "CABEAMENTO",
    label: "Cabeamento / rede",
    short: "Cabeamento",
    color: "#0EA5E9",
    keywords: [
      "cabo", "cabeamento", "fio solto", "fio exposto",
      "rede mal feita", "rede solta", "drop", "drop solto",
      "conector", "emenda", "splice", "fibra exposta",
      "fibra rompida", "trama",
    ],
    excludes: ["cabo terra", "cabo-terra"],
  },
  {
    id: "INSTALACAO",
    label: "Instalação / posicionamento",
    short: "Instalação",
    color: "#A855F7",
    keywords: [
      "instalacao", "instalação", "instalado errado",
      "posicao", "posição", "posicionamento", "fixacao",
      "fixação", "mal fixado", "frouxo", "torto", "inclinado",
      "abracadeira", "abraçadeira", "parafuso", "suporte",
      "padrao de instalacao", "padrão de instalação",
    ],
  },
  {
    id: "DOCUMENTACAO",
    label: "Documentação / fotos / vídeo",
    short: "Documentação",
    color: "#EC4899",
    keywords: [
      "foto", "fotos", "imagem", "imagens", "video", "vídeo",
      "falta foto", "sem foto", "documentacao", "documentação",
      "documento", "registro", "evidencia", "evidência",
      "qualidade da foto", "foto borrada", "foto escura",
      "imagem ruim",
    ],
  },
  {
    id: "DADOS_GPS",
    label: "Dados / GPS / coordenadas",
    short: "Dados",
    color: "#06B6D4",
    keywords: [
      "gps", "coordenada", "coordenadas", "latitude", "longitude",
      "endereco", "endereço", "municipio", "município",
      "dado", "dados", "campo", "informacao", "informação",
      "preenchimento", "incompleto", "incompleta",
    ],
  },
  {
    id: "EQUIPAMENTO",
    label: "Equipamento / modelo",
    short: "Equipamento",
    color: "#10B981",
    keywords: [
      "equipamento", "modelo", "serial", "número de serie",
      "numero de serie", "mac", "tipo de antena", "operadora",
      "ganho dbi", "ganho", "equipamento errado",
    ],
  },
  {
    id: "ALIMENTACAO",
    label: "Alimentação / energia",
    short: "Energia",
    color: "#F59E0B",
    keywords: [
      "alimentacao", "alimentação", "energia", "tensao", "tensão",
      "voltagem", "fonte", "no break", "nobreak", "bateria",
      "consumo", "fonte incorreta",
    ],
  },
];

const FALLBACK: CategoriaDef = {
  id: "OUTROS",
  label: "Outros / não classificado",
  short: "Outros",
  color: "#94A3B8",
  keywords: [],
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function classificarMotivoClient(motivo: string | null | undefined): CategoriaDef {
  if (!motivo || motivo.trim() === "") return FALLBACK;
  const n = normalizar(motivo);
  for (const cat of CATEGORIAS) {
    if (cat.excludes?.some((e) => n.includes(normalizar(e)))) continue;
    if (cat.keywords.some((k) => n.includes(normalizar(k)))) {
      return cat;
    }
  }
  return FALLBACK;
}
