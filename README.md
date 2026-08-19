# SoulSync AI

A WhatsApp-native assistant that remembers the people who matter to you and reaches out on the days that count.

You add people and their important dates through a WhatsApp conversation — no app to install, no form to fill out. Every day a scheduler finds the events happening that day, generates a personal message with an LLM in the tone you picked for that person, and delivers it over WhatsApp. If anything fails, it retries, and if it still fails, it lands in a dead-letter queue with an admin alert instead of disappearing.

The interesting engineering problem here is not generating text. It's making sure a birthday message goes out **exactly once** — never zero times because a worker crashed, and never twice because two triggers overlapped.

---

## Contents

- [How it works](#how-it-works)
- [Exactly-once delivery](#exactly-once-delivery)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [Operational endpoints](#operational-endpoints)
- [Data model](#data-model)
- [Roadmap](#roadmap)

---

## How it works

There are two independent entry points into the system: a **conversational path** where users manage their contacts, and a **scheduled path** that delivers messages.

### The conversational path

Everything a user does happens over WhatsApp, handled by a single Twilio webhook at `POST /webhooks/whatsapp`.

```
Twilio webhook
      │
      ├─ media is audio?  ──▶ download from Twilio ──▶ Whisper transcription ──▶ treat as text
      │
      ├─ unknown number?  ──▶ create user, ask for their name
      │
      ├─ onboarding incomplete?  ──▶ onboarding handler
      │
      ├─ "add person"  ──▶ start ADD_PERSON flow
      ├─ "cancel"      ──▶ reset conversation state
      │
      ├─ mid-flow?     ──▶ add-person handler (name → phone → relation → event → tone → confirm)
      │
      └─ fallback ──▶ hint message
```

Two details worth pointing out:

**Voice notes work.** If the inbound message carries audio media, the handler fetches it from Twilio's authenticated media URL and runs it through Whisper, then feeds the transcript into the same conversation flow as typed text. Users can just talk to it.

**Conversation state lives in Postgres, not memory.** Each user row carries `onboardingStep`, `conversationFlow`, and `conversationStep` enums. Webhooks are stateless and independently scaled, so keeping the state machine in the database means any instance can pick up the next message in a multi-turn flow. Partially-collected answers are held in a short-lived in-memory store keyed by user id.

The webhook always answers Twilio with `200`, including on error. A non-200 makes Twilio retry the same inbound message, which would replay the user's conversation step and corrupt the flow. Errors are logged, not surfaced as failures.

### The scheduled path

```
node-cron (19:02 Asia/Kolkata)        POST /cron/send-events
   └──────────────┬─────────────────────────────┘
                  ▼
        getTodayPendingEvents()
        events matching today's month/day
        that have no SENT message this year
                  │
                  ▼
     ┌────────────────────────────────┐
     │  message:generation queue      │
     │  concurrency 1                 │
     │  Groq llama-3.1-8b-instant     │
     │  via LangChain prompt template │
     └──────────────┬─────────────────┘
                    ▼
     ┌────────────────────────────────┐
     │  message:sending queue         │
     │  concurrency 3                 │
     │  re-check, send, record        │
     └──────────────┬─────────────────┘
                    ▼
         Twilio WhatsApp delivery
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   Messages(SENT)      3 attempts exhausted
                              │
                              ▼
                    message:dlq  ──▶  admin WhatsApp alert
```

Generation runs at concurrency 1 because LLM calls are the expensive, rate-limited step. Sending runs at 3 because Twilio tolerates parallel delivery. Splitting generation from sending means a Twilio outage never forces you to pay for the same LLM completion twice — the generated text is already sitting in the sending queue, and only the send is retried.

Both queues retry 3 times with exponential backoff starting at 2s. `removeOnFail` is `false` so failures stay inspectable.

There are two ways to trigger a run: the in-process `node-cron` schedule, and an HTTP endpoint guarded by a shared secret (`x-cron-secret`) so an external scheduler like Supabase cron can drive it instead. The HTTP route returns immediately with the queued job ids rather than blocking on delivery. On Render, use a separate Cron Job or an external scheduler for production because a web service can restart or sleep, which stops in-process timers.

### Render cron setup

For a free setup, use [cron-job.org](https://cron-job.org), which can call your Render web service even when it is sleeping. Create a job with schedule `04:02` and timezone `Asia/Kolkata`, method `POST`, and URL:

```text
https://your-render-service.onrender.com/cron/send-events
```

Add this request header:

```text
x-cron-secret: your-CRON_SECRET-value
```

Set `ENABLE_INTERNAL_CRON=false` on the Render web service so the in-process timer does not also run after a restart. Keep it unset or set it to `true` locally. The scheduler request wakes the Render service, calls the existing endpoint, and receives the queued job ids.

If you prefer Render's native Cron Job, set its schedule to `32 22 * * *` in UTC to run at `04:02 Asia/Kolkata`. Its start command is:

```sh
curl --fail-with-body --silent --show-error -X POST "$WEB_SERVICE_URL/cron/send-events" -H "x-cron-secret: $CRON_SECRET"
```

Set `WEB_SERVICE_URL` to the deployed API URL and define the same `CRON_SECRET` value on both services. Do not use `CRON_JOB_SECRET` for the external scheduler; `CRON_SECRET` is the canonical name, although the server also accepts the legacy variable for compatibility.

---

## Exactly-once delivery

This is the part of the codebase I'd point at first. "Send a birthday message once a year" sounds trivial and isn't, because there are four different ways to send a duplicate. Each one has its own defense.

**1. Enqueue-time filter, evaluated in Postgres.**

`getTodayPendingEvents()` finds events whose stored `date_value` matches today's month and day via `EXTRACT`, then excludes any that already have a `SENT` message in the current year using a `none` anti-join on the `Important_Dates → Messages` relation. Both filters run in the database. An earlier version loaded every message ever sent to a person and compared in JavaScript — unbounded memory, and it silently never matched because `important_date_id` was not being populated on insert. The anti-join is scoped to the specific event rather than the person, so someone with a birthday *and* an anniversary gets both.

**2. Deterministic job ids.**

Jobs use `gen-{eventId}-{personId}` and `send-{eventId}-{personId}` instead of random ids. Bull rejects a duplicate job id while that job is still in the queue, so two overlapping triggers collapse into one job rather than two.

**3. Send-time re-check.**

The enqueue filter runs once per batch. A second trigger overlapping an in-flight batch can still get a job past it. So the sending processor calls `hasSentMessageForEvent()` immediately before spending a Twilio send, and returns `SKIPPED` if a `SENT` row already exists. The enqueue-time and send-time checks share one `sentThisYearFilter()` helper specifically so they can't drift apart as the code changes.

**4. A partial unique index as the last line of defense.**

Application checks lose races. The real guarantee is in Postgres:

```sql
CREATE UNIQUE INDEX "Messages_important_date_id_sent_year_key"
    ON "Messages" ("important_date_id", (date_part('year', "sent_at")))
    WHERE "important_date_id" IS NOT NULL AND "status" = 'SENT';
```

`date_part('year', ...)` is `IMMUTABLE` for `timestamp without time zone`, which is what makes it legal in an index expression at all. And the `important_date_id IS NOT NULL` predicate does double duty: every pre-existing `Messages` row has a null `important_date_id`, so the index applied to the existing table with no backfill and no de-duplication step.

One `SENT` message per event per year, enforced by the database. Two things follow from this:

- Prisma can't express partial or expression indexes, so the index lives only in migration `20240103000000` and is deliberately absent from `schema.prisma`. The resulting schema drift is intentional and there's a comment in the schema saying so. Don't "fix" it.
- Because the index keys off `date_part('year', sent_at)` and `sent_at` stores UTC, the application-side year window in `messageDedupe.ts` is computed with `Date.UTC` boundaries. If it used local time, the two would disagree near New Year and the app would allow a write the database then rejects.

When a worker does lose that race, Prisma raises `P2002`. The sending processor catches it and treats it as **success**, not failure — the row it wanted already exists, so retrying would only produce a second WhatsApp message. This is the difference between an index that protects data and an index that causes incidents.

`FAILED` rows are excluded from both the index predicate and the duplicate check, so a failed attempt never blocks a later retry.

---

## Tech stack

**Server**

| Concern | Choice |
| --- | --- |
| API | Apollo Server 5 on Express 4, mounted at `/graphql` |
| Database | PostgreSQL via Prisma 5 |
| Auth | Supabase Auth, JWT in an httpOnly cookie |
| Jobs | Bull on Redis, two queues plus a DLQ |
| Scheduling | node-cron, plus an HTTP trigger for external schedulers |
| Messaging | Twilio WhatsApp Business API |
| LLM | LangChain with Groq (`llama-3.1-8b-instant`) for generation, OpenAI (`gpt-4o-mini`, `whisper-1`) for extraction and transcription |
| Validation | Zod, including structured LLM output schemas |

**Client**

React 18, Vite 5, TypeScript, Tailwind, Radix primitives (shadcn-style components), Apollo Client, React Router, React Hook Form.

**Typed end to end.** GraphQL Codegen runs in two directions: `codegen.server.ts` generates resolver types from the schema, `codegen.ts` generates typed hooks and documents for the client. A field rename in the schema becomes a compile error on both sides instead of a runtime surprise.

---

## Project layout

```
soul.sync-ai/
├── client/
│   └── src/
│       ├── components/landing/   # marketing page sections
│       ├── components/ui/        # shadcn-style primitives
│       ├── hooks/
│       ├── pages/
│       └── routes/
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/           # includes the partial unique index
│   └── src/
│       ├── ai/
│       │   ├── fetchTodayEvents.ts        # SQL anti-join for pending events
│       │   ├── sendTodayEventMessages.ts  # enqueue, non-blocking
│       │   └── llm/                       # prompts, Zod schemas, model config
│       ├── cron/
│       ├── graphql/
│       │   ├── context.ts        # Supabase cookie → user
│       │   ├── people/           # typedefs, queries, mutations, resolvers
│       │   └── user/
│       ├── lib/
│       │   ├── messageDedupe.ts  # shared UTC year window + P2002 helper
│       │   ├── twilio.ts
│       │   └── supabaseAdmin.ts
│       ├── queues/
│       │   ├── README.md         # deep dive on the queue system
│       │   ├── generation.processor.ts
│       │   ├── sending.processor.ts
│       │   ├── dlq.handler.ts
│       │   ├── admin-notifier.ts
│       │   └── metrics.ts
│       ├── webhooks/
│       │   ├── whatsapp.ts       # single inbound entry point
│       │   ├── handlers/         # onboarding, add-person state machines
│       │   └── utils/transcription.ts
│       └── server.ts
├── codegen.ts                    # client-side GraphQL codegen
└── codegen.server.ts             # server-side resolver codegen
```

`server/src/queues/README.md` covers the queue system in more depth — retry math, DLQ handling, admin notification formats, scaling notes.

---

## Running it locally

**Prerequisites:** Node 18+, a PostgreSQL database, Redis, and a Twilio WhatsApp sandbox.

```bash
# 1. install (also runs prisma generate via postinstall)
npm install

# 2. start Redis
brew services start redis        # or: docker run -d -p 6379:6379 redis:latest

# 3. configure — see the table below
cp .env.example .env             # then fill in your values

# 4. apply migrations
npx prisma migrate deploy --schema=server/prisma/schema.prisma

# 5. run client and server together
npm run dev
```

The server listens on `8080` by default and the Vite client on `3000`, which matches the server's default `CLIENT_URL` CORS origin.

**Pointing Twilio at your machine.** Twilio needs a public URL for the inbound webhook, so tunnel it:

```bash
ngrok http 8080
```

Then set the sandbox's "When a message comes in" to `https://<your-tunnel>/webhooks/whatsapp`.

### Useful scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | client and server concurrently |
| `npm run dev:server` | server only, with `tsx watch` |
| `npm run dev:client` | Vite dev server only |
| `npm run build` | build client and server |
| `npm run typecheck:server` | generate Prisma client, then `tsc --noEmit` |
| `npm run codegen:client` | regenerate client GraphQL types |
| `npm run codegen:server` | regenerate resolver types |
| `npm run lint` | ESLint |

`prisma generate` runs on `postinstall` and again before `build:server` and `typecheck:server`. Prisma's generated client includes the schema's enums, and the server imports them directly (`OnboardingStep`, `ConversationFlow`, `ConversationStep`), so a build on a clean checkout fails without it.

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (pooled) |
| `DIRECT_URL` | Direct Postgres connection, used for migrations |
| `PORT` | Server port, defaults to `8080` |
| `CLIENT_URL` | Allowed CORS origin and auth redirect target |
| `NODE_ENV` | `production` enables the `secure` flag on session cookies |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side token verification. Never expose to the client |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | Redis connection, defaults `127.0.0.1` / `6379` / `0` |
| `TWILIO_ACCOUNT_SID` | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | Also used to authenticate media downloads for voice notes |
| `TWILIO_WHATSAPP_NUMBER` | Sender, in `whatsapp:+1234567890` form |
| `GROQ_API_KEY` | Message generation |
| `OPENAI_API_KEY` | Structured extraction and Whisper transcription |
| `CRON_SECRET` | Shared secret for `POST /cron/send-events` |

---

## Operational endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/webhooks/whatsapp` | Twilio inbound messages |
| `POST` | `/cron/send-events` | External trigger for a delivery run, requires `x-cron-secret` |
| `*` | `/graphql` | Apollo GraphQL API |
| `GET` | `/health` | Liveness probe for the platform |
| `GET` | `/api/health` | Readiness with queue thresholds, `503` when degraded |
| `GET` | `/api/queue/metrics` | Waiting / active / completed / failed / delayed per queue |
| `GET` | `/api/queue/dlq` | Inspect dead-lettered jobs, `?limit=` defaults to 50 |

`/api/health` reports `DEGRADED` when either queue has 100+ failed jobs or the DLQ passes 500, which makes it usable as a real alerting signal rather than a check that only notices a fully dead process.

**Shutdown is ordered.** On `SIGTERM` or `SIGINT` the HTTP listener closes first so no new work arrives, then `closeQueues()` lets Bull finish in-flight jobs. Killing workers mid-send is exactly how you end up with an event marked pending that was actually delivered.

> Note: the metrics and DLQ endpoints are currently unauthenticated. They expose operational data including phone numbers in DLQ payloads. Put them behind auth or network restrictions before running this in production.

---

## Data model

```
User ──┬── People ──── Important_Dates ──┐
       │      │                          │
       │      └──────── Messages ────────┘
       ├── User_Preferences
       └── Whatsapp_Config
```

- **User** — WhatsApp number as the natural key, plus the three conversation state machine enums.
- **People** — someone the user wants to stay in touch with. Carries `relationshipType` and `aiTonePreference`, which both feed the prompt. Unique on `(userId, phoneNumber)`.
- **Important_Dates** — a recurring event. Unique on `(personId, dateType)`, so one birthday per person. Stored as `DATE`; only month and day are matched at send time.
- **Messages** — the delivery log and the deduplication ledger. `importantDateId` is the field the whole exactly-once story depends on; a row written without it makes its event look permanently unsent.

---

## Roadmap

- Propagate Twilio send failures. `sendWhatsAppMessage` currently catches and logs its own errors, which means the sending processor can't see a delivery failure and won't retry or dead-letter it. This is the highest-value fix in the codebase.
- Verify Twilio webhook signatures on `/webhooks/whatsapp`.
- Authenticate the queue metrics and DLQ endpoints.
- Move the temporary add-person store from process memory to Redis so multi-turn flows survive a restart and work across instances.
- Persist DLQ entries to Postgres for an audit trail beyond Redis retention.
- Per-user timezone delivery. `User_Preferences.timeZone` exists but the cron is fixed to `Asia/Kolkata`.
- Automated tests around the deduplication paths, including the P2002 race.
- Bull dashboard for queue inspection.
