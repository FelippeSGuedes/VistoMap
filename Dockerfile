# syntax=docker/dockerfile:1.7

# ── 1. Dependências ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── 2. Build ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Tokens públicos precisam estar disponíveis no momento do build.
# Passe via `--build-arg NEXT_PUBLIC_MAPBOX_TOKEN=...`
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
# Em produção: deixe vazio para que o frontend bata em /api da mesma origem.
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── 3. Runner (imagem final mínima) ───────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Standalone bind em 0.0.0.0 — sem isto containers ficam inalcançáveis.
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

# Cria a raiz dos uploads para evitar EACCES quando o volume é montado.
RUN mkdir -p /uploads && chown -R nextjs:nodejs /uploads

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
