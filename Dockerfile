FROM node:24-slim AS base

# The Codex CLI needs Node 22+; installed globally so the app can spawn it.
RUN npm install -g @openai/codex

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/.bin/tsx ./node_modules/.bin/tsx
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx

# Per-user Codex CLI credentials live here — mount a persistent volume in
# production so a redeploy doesn't sign everyone out.
RUN mkdir -p /app/.codex-subscriptions && chown nextjs:nodejs /app/.codex-subscriptions
VOLUME /app/.codex-subscriptions

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
