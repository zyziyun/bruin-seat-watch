# Bruin Seat Watch: architecture

Live: https://bruin-seat-watch.vercel.app

Two repos, one database, one scheduled job. Every arrow below is real and
verified end to end.

```
                    GitHub Actions cron, every 15 min
                                 │
                    ┌────────────▼────────────┐
                    │  zyziyun/seat-scraper   │   Python 3.12
                    │  scraper.py             │   holds INGEST_TOKEN only
                    └────────────┬────────────┘
                                 │  POST /api/ingest
                                 │  Authorization: Bearer <INGEST_TOKEN>
                                 │  { "snapshots": [ ... ] }
                    ┌────────────▼────────────┐
                    │ zyziyun/bruin-seat-watch│   Next.js 16 on Vercel
                    │                         │
                    │  /api/ingest    write   │◄── token protected
                    │  /api/sections  read    │◄── public, CORS *
                    │  /  and /section/[id]   │◄── server rendered UI
                    └────────────┬────────────┘
                                 │  Drizzle over postgres-js
                                 │  DATABASE_URL
                    ┌────────────▼────────────┐
                    │   Neon serverless PG    │
                    │   us-east-2             │
                    └─────────────────────────┘
```

## Why it is split this way

**The scraper is a separate repo, not a Vercel cron.** Vercel's Hobby plan runs
cron jobs at most once per day, at an imprecise moment inside the scheduled
hour. A 15 minute cadence is the entire premise of this project, so the
scheduler has to live somewhere else. GitHub Actions does 15 minutes for free.

**The scraper never sees the database.** It holds `INGEST_TOKEN` and posts JSON.
If that token leaks, the worst case is junk rows, which are recoverable. If
`DATABASE_URL` leaked, someone could drop the tables. This costs one HTTP hop
and removes the worst failure mode.

**Snapshots are append only.** Reference rows for subject, course and section
are upserted, but `enrollment_snapshot` is never updated or deleted. The history
is the product. Anything that overwrites history destroys the only thing here
that competitors cannot rebuild.

**Reads are public, writes are not.** All `GET` endpoints are open with
`Access-Control-Allow-Origin: *` and a 60 second edge cache. `POST /api/ingest`
requires a bearer token compared in constant time, because a plain `===` leaks
the token one character at a time to anyone patient enough to measure response
times.

## Data model

```
subject_area   code PK, name
course         id PK, subject_code FK, number, title
               UNIQUE (subject_code, number)
section        id PK, course_id FK, term, class_id, activity, instructor
               UNIQUE (term, class_id)
enrollment_snapshot
               id PK, section_id FK, captured_at,
               seats_total, seats_taken, waitlist_total, waitlist_taken, status
               INDEX (section_id, captured_at)
```

The unique constraints are what make the scraper idempotent. It can run twice on
the same minute and you get two snapshots, which is correct, but you never get
duplicate courses or sections.

`INDEX (section_id, captured_at)` is the only index that matters. Every read is
one section over a time range. Without it, the sequential scan becomes the
bottleneck within a few weeks of collection.

## Request paths

**Reading a section page.** Server Component calls `getSnapshots(id)` directly,
no `fetch` to its own API. The chart is the only Client Component on the page
and it receives plain numbers, so nothing about the database reaches the
browser.

**Reading the API.** Route handler validates input, queries, wraps the result in
`{ data }`, sets `s-maxage=60, stale-while-revalidate=600`. Snapshots change
every 15 minutes, so a shorter cache only burns database compute.

**Writing.** Scraper stamps `captured_at` itself rather than letting the server
do it. GitHub Actions runs are best effort and can be delayed 10 to 30 minutes,
so server time would be a lie about when the observation happened.

## Two database drivers, one query layer

`src/db/index.ts` picks a driver at startup:

- `DATABASE_URL` set: `postgres-js` against Neon. This is the real path.
- `DATABASE_URL` missing, local only: PGlite, a Postgres compiled to WebAssembly
  that runs inside the Node process, auto-seeded with generated data.

PGlite exists so `pnpm install && pnpm dev` works on a fresh clone with no
database and no Docker. It cannot work in production: serverless filesystems are
read only apart from `/tmp`, and each request may hit a fresh instance, so every
write would vanish. The code refuses to start PGlite when `VERCEL` is set, and
the UI renders a setup page instead of a 500.

Everything above the driver is identical, because both are Postgres and Drizzle
hides the difference.

## What is deliberately missing

- **The real scraper.** `fetch_real()` raises `NotImplementedError`. The UCLA
  Schedule of Classes is a JavaScript app, so the endpoints have to be found by
  hand in the browser network tab once. That discovery is the first task.
- **The prediction model.** It needs months of history. A model trained on three
  days is a lie with a number attached.
- **Alerts and auth.** Nothing here needs a login yet.

## Cost

Zero, at this scale.

| Piece | Plan | Limit that would bite first |
|---|---|---|
| Vercel | Hobby | 1M function invocations per month |
| Neon | Free | 0.5 GB storage, 100 CU-hours per month |
| GitHub Actions | Free, public repo | scheduled runs disabled after 60 days idle |

Storage is the one to watch. At 9k sections every 15 minutes, snapshots grow by
roughly 25M rows per month, which will exceed 0.5 GB. The fix is not a bigger
plan, it is to stop storing rows that say nothing changed. Write a snapshot only
when a count differs from the previous one, and the volume drops by more than an
order of magnitude.
