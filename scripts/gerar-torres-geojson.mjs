/**
 * Converte public/torres_operadoras.csv (base de licenciamento da Anatel,
 * 36 colunas) no GeoJSON enxuto que o mapa consome.
 *
 * Por que não ler o CSV direto no cliente: são 791 KB e 36 colunas das
 * quais o mapa usa 5 — parsear isso a cada abertura do mapa (ainda mais
 * no WebView do app) é desperdício. A conversão roda aqui, uma vez, e o
 * app baixa só o GeoJSON pronto.
 *
 * Uso: node scripts/gerar-torres-geojson.mjs
 * Rode de novo se o CSV da Anatel for atualizado.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = "public/torres_operadoras.csv";
// .json, não .geojson, DE PROPÓSITO: o nginx serve estáticos sob /painel/ por
// allowlist de extensão (ver scripts/nginx-https.conf) e .geojson não está
// nela — o painel tomaria 404. GeoJSON é JSON, então a extensão é honesta e
// evita mexer em infra. Mesmo gotcha de [[webpush-painel]].
const SAIDA = "public/torres-operadoras.json";

/** Parser de CSV com aspas (endereços e códigos vêm com vírgula dentro). */
function parseLinha(linha) {
  const campos = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (c === "," && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

/** "CLARO S.A." / "TELEFONICA BRASIL S.A." / "Telefonica Brasil S.a." /
 *  "TELEFÔNICA BRASIL S.A." -> "claro" | "vivo". */
function operadoraDe(nomeEntidade) {
  const n = nomeEntidade
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (n.includes("CLARO")) return "claro";
  if (n.includes("TELEFONICA") || n.includes("VIVO")) return "vivo";
  return null;
}

const linhas = readFileSync(ENTRADA, "utf8").split(/\r?\n/);
const cab = parseLinha(linhas[0]);
const idx = (nome) => cab.indexOf(nome);

const COL = {
  entidade: idx("NomeEntidade"),
  endereco: idx("EnderecoEstacao"),
  uf: idx("SiglaUf"),
  tecnologia: idx("Tecnologia"),
  altura: idx("AlturaAntena"),
  lat: idx("Latitude"),
  lng: idx("Longitude"),
  municipio: idx("Municipio.NomeMunicipio"),
};
for (const [k, v] of Object.entries(COL)) {
  if (v < 0) throw new Error(`Coluna não encontrada no CSV: ${k}`);
}

// Dedup por coordenada: a Anatel lista uma linha por licença/antena, então
// a MESMA torre física aparece várias vezes (frequências/azimutes
// diferentes). O mapa quer a torre, não a licença.
const porCoord = new Map();
let ignoradas = 0;

for (let i = 1; i < linhas.length; i++) {
  const linha = linhas[i];
  if (!linha.trim()) continue;
  const c = parseLinha(linha);
  const lat = Number(c[COL.lat]);
  const lng = Number(c[COL.lng]);
  const operadora = operadoraDe(c[COL.entidade] ?? "");
  if (!operadora || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    ignoradas++;
    continue;
  }
  // 5 casas ~ 1 m de precisão: suficiente pro mapa e corta bytes à toa.
  const chave = `${lat.toFixed(5)},${lng.toFixed(5)},${operadora}`;
  if (porCoord.has(chave)) continue;

  const altura = Number(c[COL.altura]);
  porCoord.set(chave, {
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(lng.toFixed(5)), Number(lat.toFixed(5))] },
    properties: {
      op: operadora,
      mun: (c[COL.municipio] ?? "").trim() || undefined,
      uf: (c[COL.uf] ?? "").trim() || undefined,
      end: (c[COL.endereco] ?? "").trim() || undefined,
      tec: (c[COL.tecnologia] ?? "").trim() || undefined,
      alt: Number.isFinite(altura) && altura > 0 ? altura : undefined,
    },
  });
}

const features = [...porCoord.values()];
const geojson = { type: "FeatureCollection", features };
writeFileSync(SAIDA, JSON.stringify(geojson));

const porOp = features.reduce((acc, f) => {
  acc[f.properties.op] = (acc[f.properties.op] ?? 0) + 1;
  return acc;
}, {});
console.log(`${SAIDA}: ${features.length} torres`, porOp, `(${ignoradas} linhas ignoradas)`);
