# VistoMap — Plataforma Enterprise de Vistorias em Campo

PWA mobile-first construída em Next.js 14 / React 18 / TypeScript / TailwindCSS / Framer Motion / Mapbox GL JS para execução de vistorias técnicas em campo, com mapa operacional, GPS, captura de mídia e workflow integrado ao GLPI.

---

## Tecnologias

- **Next.js 14 (App Router)** — SSR/SSG, Routing.
- **React 18 + TypeScript estrito**.
- **TailwindCSS** com paleta enterprise (Verde Petróleo `#073B4C`, Esmeralda `#06D6A0`, Amarelo Elétrico `#FFD166`).
- **Framer Motion** — microinterações e drag handle do mapa.
- **Mapbox GL JS** — mapa operacional, marcadores customizados, popup glassmorphism.
- **Zustand** — store global (auth + vistorias + filtros).
- **React Hook Form** — formulários (login).
- **Axios** — services tipadas com fallback offline.
- **next-pwa** — service worker, manifest, instalável.
- **Lucide React** — ícones.

---

## Estrutura

```
src/
├─ app/
│  ├─ layout.tsx           # Shell + fontes + metadata + PWA
│  ├─ providers.tsx
│  ├─ page.tsx             # Redirect inicial
│  ├─ login/page.tsx       # Login premium
│  ├─ dashboard/page.tsx   # Hero + KPIs + atalhos
│  └─ vistorias/
│     ├─ page.tsx          # Mapa operacional + lista + filtros
│     └─ [id]/page.tsx     # Execução de vistoria (GPS, fotos, observações)
├─ components/
│  ├─ ui/                  # Button, Card, Input, Textarea, Pill, BottomSheet, Skeleton, Badge
│  ├─ feedback/            # LoadingShell, EmptyState, ProgressOverlay
│  ├─ layout/              # AppHeader, BottomNav
│  ├─ icons/               # Logo
│  └─ vistorias/           # MapView, MobileMapShell, FiltersBottomSheet, MapListToggle, VistoriaCard, SearchHeader, StatusBadge, PriorityBadge, VistoriaListSkeleton
├─ hooks/
│  ├─ useGeolocation.ts    # navigator.geolocation com alta precisão
│  ├─ useFilteredVistorias.ts
│  └─ useMediaQuery.ts
├─ services/
│  ├─ api.ts               # Axios instance + interceptors + token
│  ├─ auth.ts              # Login/logout + persistência
│  ├─ vistorias.ts         # Stats, listagem, finalização
│  └─ maps.ts              # Mapbox config + URLs Waze/Google Maps
├─ store/
│  ├─ auth.ts
│  └─ vistorias.ts
├─ types/index.ts
└─ utils/
   ├─ cn.ts
   ├─ format.ts            # Cores, labels, distância, mobile-detect, haversine
   ├─ image.ts             # Compressão de fotos (canvas)
   └─ mock.ts              # Dados de demonstração
```

---

## Setup

```bash
# 1. Instale dependências
npm install

# 2. Crie o arquivo .env.local
cp .env.local.example .env.local
# edite NEXT_PUBLIC_MAPBOX_TOKEN com seu token público (https://account.mapbox.com)

# 3. Rode o dev server (Turbopack/Webpack)
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

### Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Token público do Mapbox (obrigatório para o mapa) |
| `NEXT_PUBLIC_API_URL` | URL base da API real. Se ausente ou indisponível, services usam fallback mock. |

### Build de produção

```bash
npm run build
npm run start
```

---

## PWA

- Manifest em `public/manifest.json`.
- Service worker é **gerado automaticamente** pelo `next-pwa` em produção (`public/sw.js`). Em dev é desabilitado.
- Ícone vetorial em `public/icons/icon.svg` (compatível com Chrome/Edge/Android).
- Cache estratégico:
  - **CacheFirst** para tiles do Mapbox.
  - **StaleWhileRevalidate** para imagens.
  - **NetworkFirst** com timeout de 10s para o resto.
- Para instalar como app: abra no Chrome mobile → "Adicionar à tela inicial".

> **Para gerar PNGs 192×192 e 512×512** (recomendado para iOS), exporte `public/icons/icon.svg` em ferramentas como Figma ou `npx pwa-asset-generator public/icons/icon.svg public/icons`.

---

## Mapa operacional

- Mapbox GL JS (`mapbox://styles/mapbox/streets-v12`), zoom inicial 11.
- Centro:
  - `navigator.geolocation` se permitido;
  - fallback São Paulo: `[-46.6333, -23.5505]`.
- Marker do usuário em `#06D6A0` com popup "📍 Sua localização".
- Pins de vistoria com glow neon + halo + pulse, cores por status.
- Popup glass com botão "Navegar" que detecta mobile e abre **Waze** (mobile) ou **Google Maps** (desktop):
  - `https://waze.com/ul?ll=LAT,LONG&navigate=yes`
  - `https://www.google.com/maps/search/?api=1&query=LAT,LONG`
- Layout responsivo:
  - **Desktop ≥ 1024px**: 2 colunas (lista esquerda + mapa direita).
  - **Mobile**: drag handle estilo Airbnb com 3 snaps (mapa cheio / 50% / lista cheia), botão flutuante "Mapa ↔ Lista".

---

## Execução de vistoria

- Campos somente leitura: equipamento, cidade, endereço, técnico, categoria, identificador GLPI.
- GPS: campos `Latitude` / `Longitude` bloqueados, atualizados via "Atualizar Coordenadas" (`navigator.geolocation` com `enableHighAccuracy: true`, timeout 15 s).
- Fotos:
  - `<input type="file" accept="image/*" capture="environment" multiple>`.
  - Compressão automática para JPEG ~1280px / 78% qualidade via `<canvas>`.
  - Preview em grid com remoção animada.
- Observações: textarea com auto-resize + contador (1200 caracteres).
- "Finalizar Vistoria" → envia `vistoria_id`, lat/lng, fotos (data URLs), observações, timestamp; durante upload exibe overlay fullscreen com progresso e bloqueio de cliques duplos.
- Empty state quando ID inexistente.

---

## Comportamento offline / fallback

- Os services capturam falha de rede e retornam dados mock em desenvolvimento, garantindo UX completa mesmo sem backend GLPI.
- Em produção, qualquer 401 limpa o token e redireciona ao login.

---

## Roadmap sugerido (fora do escopo desta entrega)

- Sincronização offline real com IndexedDB (Dexie).
- Empacotamento Capacitor → APK/IPA assinado.
- Push notifications nativas via FCM/APNs.
- Filtro espacial via `@turf/turf`.
- Autenticação SSO contra o GLPI.

---

© VistoMap Field Ops — design enterprise pronto para produção operacional.
