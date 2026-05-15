# syntax=docker/dockerfile:1.7

# ── 1. Dependências ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ── 2. Build TS ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── 3. Runner (imagem final) ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Apenas deps de produção
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/knexfile.ts ./knexfile.ts
COPY --from=builder /app/migrations ./migrations

# Usuário não-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 fastify \
 && chown -R fastify:nodejs /app
USER fastify

EXPOSE 3001
CMD ["node", "dist/server.js"]
