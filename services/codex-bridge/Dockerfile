FROM node:24-slim AS base
# The Codex CLI is the whole point of this service; it needs Node 22+.
RUN npm install -g @openai/codex

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV CODEX_SUBSCRIPTION_HOME=/data/codex-subscriptions

COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

# Per-user Codex credentials. Mount a persistent volume here, or everyone is
# signed out on every redeploy.
RUN mkdir -p /data/codex-subscriptions
VOLUME /data/codex-subscriptions

EXPOSE 8080
CMD ["node", "dist/index.js"]
