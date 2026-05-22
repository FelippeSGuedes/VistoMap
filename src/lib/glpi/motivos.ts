import "server-only";

/**
 * Classificador de motivos de reprovação.
 *
 * `motivofield` é texto livre — técnicos escrevem variações ("Poste
 * Incorreto", "altura errada do poste", "PSPOSTE trocado") que se
 * referem ao mesmo problema. Esta lib normaliza + faz match por
 * keywords ordenadas por especificidade.
 *
 * Categorias derivam de padrões reais de vistorias CPFL/concessionárias:
 * poste/antena/aterramento/cabeamento/documentação/dados/instalação.
 *
 * Uso:
 *   const cat = classificarMotivo("Altura de Poste incorreta");
 *   // → { id: "ALTURA_ANTENA", label: "Altura da antena/poste", color: "#3B82F6" }
 *
 * Para agregar:
 *   const dist = agregarMotivos(["motivo1", "motivo2", ...]);
 *   // → Array<{ id, label, color, total, pct, exemplos }>
 */

export type MotivoCategoria =
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

export interface CategoriaDef {
  id: MotivoCategoria;
  label: string;
  color: string;
  /** Keywords (lowercase, sem acento) — qualquer match conta. */
  keywords: string[];
  /** Keywords negativas — se aparecem, NÃO classifica como esta. */
  excludes?: string[];
}

/**
 * Ordem importa: mais específico primeiro. Primeira categoria que casa
 * leva o motivo.
 */
const CATEGORIAS: CategoriaDef[] = [
  {
    id: "POSTE_TROCA",
    label: "Troca / identificação de poste",
    color: "#F97316",
    keywords: [
      "psposte", "ps poste", "ps-poste",
      "poste incorreto", "poste errado", "poste trocado",
      "trocou o poste", "trocou de poste", "trocar poste",
      "id do poste", "numero do poste", "número do poste",
      "n do poste", "identificacao do poste", "identificação do poste",
      "poste nao confere", "poste não confere",
    ],
  },
  {
    id: "ALTURA_ANTENA",
    label: "Altura da antena / instalação vertical",
    color: "#3B82F6",
    keywords: [
      "altura", "alturada", "altura da antena", "altura do poste",
      "antena baixa", "antena alta", "antena mal posicionada",
      "altura insuficiente", "altura incorreta", "altura errada",
      "metro da antena", "metros da antena",
      "fora da altura", "fora de altura",
    ],
  },
  {
    id: "ATERRAMENTO",
    label: "Aterramento",
    color: "#EAB308",
    keywords: [
      "aterramento", "aterramt", "aterramento incorreto",
      "fio terra", "fio-terra", "cabo terra", "cabo-terra",
      "sem aterramento", "falta aterramento", "falta de aterramento",
      "aterrar", "aterrado", "nao aterrado", "não aterrado",
      "haste de terra",
    ],
  },
  {
    id: "CABEAMENTO",
    label: "Cabeamento / rede",
    color: "#0EA5E9",
    keywords: [
      "cabo", "cabeamento", "fio solto", "fio exposto",
      "rede mal feita", "rede mal-feita", "rede solta",
      "drop", "drop solto", "conector", "emenda",
      "splice", "fibra exposta", "fibra rompida",
      "trama", "trama mal feita",
    ],
    excludes: ["cabo terra", "cabo-terra"],
  },
  {
    id: "INSTALACAO",
    label: "Instalação / posicionamento",
    color: "#A855F7",
    keywords: [
      "instalacao", "instalação", "instalado errado",
      "posicao", "posição", "posicionamento",
      "fixacao", "fixação", "mal fixado", "mal-fixado",
      "frouxo", "torto", "inclinado",
      "abracadeira", "abraçadeira", "parafuso",
      "suporte", "suporte solto", "suporte mal fixado",
      "padrao de instalacao", "padrão de instalação",
    ],
  },
  {
    id: "DOCUMENTACAO",
    label: "Documentação / fotos / vídeo",
    color: "#EC4899",
    keywords: [
      "foto", "fotos", "imagem", "imagens",
      "video", "vídeo", "video 360", "vídeo 360",
      "falta foto", "faltam fotos", "sem foto", "sem fotos",
      "documentacao", "documentação", "documento",
      "registro", "evidencia", "evidência",
      "qualidade da foto", "foto borrada", "foto escura",
      "imagem ruim", "imagem nao", "imagem não",
    ],
  },
  {
    id: "DADOS_GPS",
    label: "Dados / GPS / coordenadas",
    color: "#06B6D4",
    keywords: [
      "gps", "coordenada", "coordenadas", "latitude", "longitude",
      "endereco", "endereço", "endereço errado",
      "municipio", "município",
      "dado", "dados", "campo", "informacao", "informação",
      "preenchimento", "preencher",
      "dados incompletos", "dados incorretos", "dados errados",
      "incompleto", "incompleta",
    ],
  },
  {
    id: "EQUIPAMENTO",
    label: "Equipamento / modelo / serial",
    color: "#10B981",
    keywords: [
      "equipamento", "modelo", "serial", "número de serie",
      "número de série", "numero de serie", "numero de série",
      "mac", "mac address",
      "tipo de antena", "operadora", "operadora 4g",
      "ganho dbi", "ganho",
      "equipamento errado", "equipamento incorreto",
    ],
  },
  {
    id: "ALIMENTACAO",
    label: "Alimentação / energia / tensão",
    color: "#F59E0B",
    keywords: [
      "alimentacao", "alimentação", "energia",
      "tensao", "tensão", "voltagem",
      "fonte", "no break", "no-break", "nobreak",
      "bateria", "consumo",
      "fonte incorreta", "alimentacao incorreta", "alimentação incorreta",
    ],
  },
];

const FALLBACK: CategoriaDef = {
  id: "OUTROS",
  label: "Outros / não classificado",
  color: "#94A3B8",
  keywords: [],
};

/** Remove acentos + lowercase + colapsa espaços. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function classificarMotivo(motivo: string | null | undefined): CategoriaDef {
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

export interface MotivoAgregado {
  id: MotivoCategoria;
  label: string;
  color: string;
  total: number;
  pct: number;
  /** Até 3 exemplos do texto original pra contexto. */
  exemplos: string[];
}

/**
 * Agrega lista de motivos brutos em distribuição por categoria.
 * Retorna ordenado por total desc, % calculado sobre total não vazio.
 */
export function agregarMotivos(motivos: Array<string | null | undefined>): MotivoAgregado[] {
  const buckets = new Map<MotivoCategoria, {
    def: CategoriaDef;
    total: number;
    exemplos: Set<string>;
  }>();

  let totalClassificavel = 0;
  for (const m of motivos) {
    const def = classificarMotivo(m);
    if (!buckets.has(def.id)) {
      buckets.set(def.id, { def, total: 0, exemplos: new Set() });
    }
    const b = buckets.get(def.id)!;
    b.total += 1;
    totalClassificavel += 1;
    if (m && b.exemplos.size < 3) {
      const ex = m.trim().slice(0, 80);
      if (ex) b.exemplos.add(ex);
    }
  }

  const arr: MotivoAgregado[] = [];
  for (const b of buckets.values()) {
    arr.push({
      id: b.def.id,
      label: b.def.label,
      color: b.def.color,
      total: b.total,
      pct: totalClassificavel > 0 ? Math.round((b.total / totalClassificavel) * 1000) / 10 : 0,
      exemplos: Array.from(b.exemplos),
    });
  }
  return arr.sort((a, b) => b.total - a.total);
}

export const CATEGORIAS_DEF = CATEGORIAS;
