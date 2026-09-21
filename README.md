# IT Priorities

Aquatiq's shared board for what IT is currently prioritizing. Two lanes — **Robert** and **Ima** — hold the current initiatives; anyone on the allow-list can sign in with Microsoft, drag cards between lanes or up/down to reprioritize, add new priorities, manage who else can sign in, and use an AI assistant that runs on their own OpenAI Codex subscription.

## Stack

Next.js 16 (App Router) · TypeScript 6 · Tailwind CSS v4 · shadcn/ui (Base UI) · Better Auth (Microsoft Entra ID) · Prisma ORM 7 + Postgres · `@dnd-kit/react` · `@assistant-ui/react` · Application Insights (optional)

## Prerequisites

- Node.js 24+
- Docker (the included `docker-compose.yml` runs Postgres and the codex-bridge locally)
- For real Microsoft sign-in: an Azure AD (Entra ID) App Registration — see below. Not needed for local dev; a dev-only email sign-in is built in (see "Local development" below).
- For the AI assistant: each user's own ChatGPT/OpenAI account. The [`@openai/codex`](https://www.npmjs.com/package/@openai/codex) CLI is baked into the codex-bridge image, so you don't install it yourself.

## Local development

```bash
docker compose up -d          # Postgres on :5432, codex-bridge on :8092 (it listens on 8080 inside the container)
cp .env.example .env          # if you haven't already
npx prisma migrate dev
npx tsx prisma/seed.ts        # seeds the 5 launch users + starting priorities
npm run dev
```

Open <http://localhost:3000> (or `npm run dev -- --port 4300` if 3000 is taken, which is what `.claude/launch.json` does). Since a real Azure AD app registration isn't required for local dev, the sign-in page has a **"Dev only"** email sign-in box below the Microsoft button — enter one of the seeded emails (e.g. `ima.dacosta@aquatiq.com`) and any password; it signs you up on first use. This is compiled out of production builds (`emailAndPassword` is disabled server-side when `NODE_ENV=production`, see `src/lib/auth.ts`).

## Setting up real Microsoft sign-in

1. In the [Azure Portal](https://portal.azure.com), go to **Microsoft Entra ID → App registrations → New registration**.
2. Name it (e.g. "IT Priorities"), leave it **single tenant**, and set the redirect URI to a **Web** platform URI: `<your-app-url>/api/auth/callback/microsoft-entra-id` (for local testing: `http://localhost:3000/api/auth/callback/microsoft-entra-id`).
3. Under **Certificates & secrets**, create a new client secret and copy its value immediately (it's only shown once).
4. Collect three values and put them in `.env`:
   - `MICROSOFT_CLIENT_ID` — the app registration's "Application (client) ID"
   - `MICROSOFT_CLIENT_SECRET` — the client secret value from step 3
   - `MICROSOFT_TENANT_ID` — your tenant's GUID (Entra ID → Overview → "Tenant ID"). Must be a real GUID, not `common`/`organizations`.
5. Also set `BETTER_AUTH_URL` to your app's real URL, and `BETTER_AUTH_SECRET` to a fresh random value (`openssl rand -base64 32`) if deploying (don't reuse the one committed for local dev).
6. Restart the app. Sign-in only succeeds for emails already in the allow-list (see below) — the 5 launch emails are seeded; everyone else needs to be added first.

## Managing who can sign in

Any signed-in user can add or remove people from **Users** in the nav — no code changes needed. Only `@aquatiq.com` emails are accepted. Removing someone takes effect immediately, even if they have an active session, since every request re-checks the allow-list (see `src/lib/auth-guard.ts`).

## Architecture: app + codex-bridge

The app is split in two, mirroring how CoresSystem separates its gateway from Integration Core:

| Piece | Runs on | Responsibility |
| --- | --- | --- |
| **Next.js app** (`src/`) | Anywhere, incl. Vercel | Sign-in, board, users, and a thin authenticated proxy for the assistant |
| **codex-bridge** (`services/codex-bridge/`) | A persistent host with a disk | Owns the `codex` CLI subprocesses and each user's credentials |

That split exists because connecting a Codex subscription needs a subprocess plus in-memory login state that survives several HTTP requests, and each person's credential lives on local disk — none of which serverless platforms support. Keeping that in a separate service lets the app itself stay serverless-deployable.

They talk over HTTP with a shared secret (`X-Internal-API-Key`), the same pattern Integration Core uses.

### The AI assistant

Each person connects their **own** Codex/ChatGPT subscription in **Settings → Assistant** — nobody's usage is billed to anyone else. The bridge spawns the real `codex` CLI in "app-server" mode per user (JSON-RPC over stdio, following [OpenAI's documented protocol](https://developers.openai.com/codex/app-server)), isolated to a per-user credential directory under `CODEX_SUBSCRIPTION_HOME`. No Codex token ever reaches this app's database.

If `CODEX_BRIDGE_URL`/`CODEX_BRIDGE_API_KEY` aren't set, the app still builds and runs — the Assistant page just reports itself as unavailable on that deployment.

**Deploying the bridge** (`services/codex-bridge/Dockerfile`) needs:
- Persistent disk mounted at `CODEX_SUBSCRIPTION_HOME`, or everyone is signed out on each redeploy (on Azure App Service only `/home` persists)
- A single instance — the pending-login map is process-local, so multi-instance needs sticky sessions at minimum
- Network reachability from the app, and a strong `CODEX_BRIDGE_API_KEY` shared between the two

## Database

Prisma 7 (Rust-free, driver-adapter based). Key commands:

```bash
npx prisma migrate dev --name <description>   # create + apply a migration
npx prisma generate                            # regenerate the client after schema changes
npx tsx prisma/seed.ts                         # re-run the seed (upserts users, skips tasks if any already exist)
```

## Deploying

### The app (Vercel or any Next.js host)

Point it at the repo root. Environment variables to set:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | A reachable hosted Postgres — not `localhost` |
| `BETTER_AUTH_SECRET` | Fresh value: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The deployment's real URL. Optional on Vercel — falls back to `VERCEL_PROJECT_PRODUCTION_URL`; set it explicitly on any other host, and on Vercel if sign-in should work from a non-production domain |
| `MICROSOFT_CLIENT_ID` / `_SECRET` / `_TENANT_ID` | From the Azure app registration; sign-in reports itself unconfigured until all three are set |
| `CODEX_BRIDGE_URL` / `CODEX_BRIDGE_API_KEY` | The bridge's URL and shared secret; omit to ship without the assistant |
| `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` | Optional RUM |

Run `npx prisma migrate deploy` against the production database before first use, then seed it once with `npx tsx prisma/seed.ts`.

The live deployment is <https://it-priorities-two.vercel.app>. Its Azure redirect URI — verified against the URL Better Auth actually generates, which is `<baseURL>/api/auth/callback/<providerId>` — is exactly:

```
https://it-priorities-two.vercel.app/api/auth/callback/microsoft-entra-id
```

`BETTER_AUTH_SECRET` is not optional: without it Better Auth throws on every request and `/sign-in` takes the whole function down (exit 128), which looks like a build problem but is not one.

### Database (current production setup)

Production Postgres is **Neon via the Vercel Marketplace**, free plan, region `fra1` (`eu-central-1`, Frankfurt — EU residency, which matters given NIS2 is on this very board). It's connected to Production and Preview only, so local development keeps using the Docker Postgres.

```bash
vercel integration add neon --plan free_v3 -m region=fra1 -m auth=false \
  -n it-priorities-db -e production -e preview
```

Neon's own auth add-on is deliberately off — Better Auth plus Entra ID already owns identity here.

The integration injects both `DATABASE_URL` (pooled, through PgBouncer) and `DATABASE_URL_UNPOOLED` (direct). Run migrations against the **unpooled** one; Prisma Migrate takes advisory locks that a transaction-mode pooler won't hold:

```bash
DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy
DATABASE_URL="$DATABASE_URL_UNPOOLED" npx tsx prisma/seed.ts
```

The running app uses the pooled `DATABASE_URL`, which is the right choice for serverless. Note that changing any environment variable needs a **redeploy** to take effect — Vercel injects them at build time, so setting a variable alone changes nothing.


### The bridge (any container host with a volume)

```bash
cd services/codex-bridge
docker build -t codex-bridge .
docker run -p 8080:8080 \
  -e CODEX_BRIDGE_API_KEY=<same secret as the app> \
  -v codex-subscriptions:/data/codex-subscriptions \
  codex-bridge
```

Keep it on one instance, give it a persistent volume, and don't expose it publicly beyond what the app needs to reach.

## Known limitations (v1)

- No live sync between two open browser tabs — the board updates on next navigation, not in real time. Fine at this scale (5 people, 2 lanes); a future iteration could add polling or SSE.
- The seed data's grouping of the original priorities list into 10 cards is a best-effort read of a flat bullet list — edit freely in the app if anything should be split, merged, or reassigned.
- Application Insights RUM is wired up but inert until `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` is set.
