# IT Priorities

Aquatiq's shared board for what IT is currently prioritizing. Two lanes — **Robert** and **Ima** — hold the current initiatives; anyone on the allow-list can sign in with Microsoft, drag cards between lanes or up/down to reprioritize, add new priorities, manage who else can sign in, and use an AI assistant that runs on their own OpenAI Codex subscription.

## Stack

Next.js 16 (App Router) · TypeScript 6 · Tailwind CSS v4 · shadcn/ui (Base UI) · Better Auth (Microsoft Entra ID) · Prisma ORM 7 + Postgres · `@dnd-kit/react` · `@assistant-ui/react` · Application Insights (optional)

## Prerequisites

- Node.js 24+
- A Postgres database (a `docker-compose.yml` is included for local dev)
- For real Microsoft sign-in: an Azure AD (Entra ID) App Registration — see below. Not needed for local dev; a dev-only email sign-in is built in (see "Local development" below).
- For the AI assistant: the [`@openai/codex`](https://www.npmjs.com/package/@openai/codex) CLI installed and on `PATH` (`npm install -g @openai/codex`, requires Node 22+), and each user's own ChatGPT/OpenAI account.

## Local development

```bash
docker compose up -d          # starts Postgres on localhost:5432
cp .env.example .env          # if you haven't already — the tracked .env already has working local defaults
npx prisma migrate dev
npx tsx prisma/seed.ts        # seeds the 5 launch users + starting priorities
npm run dev
```

Open <http://localhost:3000>. Since a real Azure AD app registration isn't required for local dev, the sign-in page has a **"Dev only"** email sign-in box below the Microsoft button — enter one of the seeded emails (e.g. `ima.dacosta@aquatiq.com`) and any password; it signs you up on first use. This is compiled out of production builds (`emailAndPassword` is disabled server-side when `NODE_ENV=production`, see `src/lib/auth.ts`).

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

## The AI assistant

Each person connects their **own** Codex/ChatGPT subscription in **Settings → Assistant** — nobody's usage is billed to anyone else. This works by spawning the real `codex` CLI in "app-server" mode per user (JSON-RPC over stdio, following [OpenAI's documented protocol](https://developers.openai.com/codex/app-server)), isolated to a per-user credential directory (`CODEX_SUBSCRIPTION_HOME`, default `./.codex-subscriptions`) that never touches the app's database — this mirrors how Aquatiq's own CoresSystem Integration Core brokers Codex subscriptions.

**Deployment implication:** because connecting requires a subprocess + in-memory login state to survive across a few HTTP requests, and each user's credential lives on local disk, this cannot run on serverless/edge platforms (e.g. plain Vercel functions). It needs:
- A persistent Node.js server process (the included `Dockerfile`, a VM, or a container host)
- Persistent disk for `CODEX_SUBSCRIPTION_HOME` that survives restarts (on Azure App Service, only `/home` persists — point the env var there)
- A single instance (the pending-login map is process-local; a load-balanced multi-instance deployment needs sticky sessions at minimum)

If the `codex` binary isn't installed or isn't on `PATH`, connecting fails with a clear error instead of crashing the server.

## Database

Prisma 7 (Rust-free, driver-adapter based). Key commands:

```bash
npx prisma migrate dev --name <description>   # create + apply a migration
npx prisma generate                            # regenerate the client after schema changes
npx tsx prisma/seed.ts                         # re-run the seed (upserts users, skips tasks if any already exist)
```

## Deploying

```bash
docker build -t it-priorities .
docker run -p 3000:3000 \
  -e DATABASE_URL=... -e BETTER_AUTH_SECRET=... -e BETTER_AUTH_URL=... \
  -e MICROSOFT_CLIENT_ID=... -e MICROSOFT_CLIENT_SECRET=... -e MICROSOFT_TENANT_ID=... \
  -v codex-subscriptions:/app/.codex-subscriptions \
  it-priorities
```

Run `npx prisma migrate deploy` against the production database before (or via an init container/job) the app starts.

## Known limitations (v1)

- No live sync between two open browser tabs — the board updates on next navigation, not in real time. Fine at this scale (5 people, 2 lanes); a future iteration could add polling or SSE.
- The seed data's grouping of the original priorities list into 10 cards is a best-effort read of a flat bullet list — edit freely in the app if anything should be split, merged, or reassigned.
- Application Insights RUM is wired up but inert until `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` is set.
