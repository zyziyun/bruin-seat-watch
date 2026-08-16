# Bruin Seat Watch

UCLA publishes live seat counts for every section but nobody keeps the history.
This project snapshots every section every 15 minutes, stores the time series,
and exposes it through a public API.

The dataset is the point. Anyone can rebuild the UI. Nobody else has three
months of enrollment history, and the only way to get it is to have started
three months ago.

Status: working skeleton. The web app, database, API, ingest path, and scheduler
are all real and end to end. The scraper still runs on generated data, because
discovering the real UCLA endpoints is the first task, not the last.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16, App Router, Turbopack |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Postgres, Neon in production |
| ORM | Drizzle |
| Charts | Recharts |
| Hosting | Vercel |
| Scraper | Python 3.12, separate repo |
| Scheduler | GitHub Actions cron |

## Run it locally

Zero setup. No database required.

```bash
pnpm install
pnpm dev
```

With no `DATABASE_URL`, the app starts [PGlite](https://pglite.dev/), a Postgres
that runs inside the Node process, and seeds it with generated data. This is a
convenience for a fresh clone. It is **not** the real architecture and it cannot
work on Vercel, because serverless filesystems are read only and every request
may hit a fresh instance.

To reset the local database:

```bash
pnpm db:reset-local
```

## Run it against real Postgres

```bash
cp .env.example .env.local     # then fill in DATABASE_URL and INGEST_TOKEN
pnpm db:setup --seed           # create tables, load demo rows
pnpm dev
```

`DATABASE_URL` can point at Neon or at a local Postgres:

```bash
docker run -d --name bsw-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=bsw \
  -p 55432:5432 postgres:16-alpine
# DATABASE_URL=postgres://postgres:dev@localhost:55432/bsw
```

## Deploy

```bash
pnpm dlx vercel        # preview
pnpm dlx vercel --prod # production
```

Then in Vercel project settings, Environment Variables, add:

- `DATABASE_URL`, the Neon connection string
- `INGEST_TOKEN`, any long random string. Generate one with `openssl rand -hex 32`

The app throws on boot in production if `DATABASE_URL` is missing, on purpose.
A site that looks fine and stores nothing is worse than a site that fails.

## Public API

Read endpoints are open, CORS is `*`, responses are cached at the edge for 60
seconds. Every response is wrapped in `{ "data": ... }`, errors in
`{ "error": { "status", "message" } }`.

### `GET /api/sections?q=`

Latest known state of each matching section. `q` matches `SUBJECT NUMBER` or the
course title, and is capped at 100 characters.

```bash
curl "http://localhost:3000/api/sections?q=COM%20SCI"
```

```json
{
  "data": {
    "query": "COM SCI",
    "count": 4,
    "sections": [
      {
        "id": 2,
        "subject": "COM SCI",
        "number": "32",
        "title": "Introduction to Computer Science II",
        "activity": "Lec 1",
        "term": "26F",
        "seats": { "total": 350, "taken": 349 },
        "waitlist": { "taken": 24 },
        "status": "Open",
        "observedAt": "2026-10-06T05:00:00.000Z"
      }
    ]
  }
}
```

### `GET /api/sections/:id`

One section plus statistics derived from its whole history.

```json
{
  "data": {
    "id": 2,
    "subject": "COM SCI",
    "number": "32",
    "history": {
      "observations": 168,
      "firstFullAt": "2026-09-23T11:00:00.000Z",
      "seatReleases": 15,
      "seatReleasesPerDay": 1.18
    }
  }
}
```

### `GET /api/sections/:id/snapshots`

The raw time series. This is the endpoint that does not exist anywhere else.

```json
{
  "data": {
    "sectionId": 2,
    "count": 168,
    "snapshots": [
      {
        "at": "2026-09-15T08:00:00.000Z",
        "seatsTotal": 350,
        "seatsTaken": 125,
        "waitlistTaken": 0,
        "status": "Open"
      }
    ]
  }
}
```

### `POST /api/ingest`

Not public. Requires `Authorization: Bearer $INGEST_TOKEN`. The scraper holds
this token and never sees the database credentials. Tokens are compared in
constant time, because a plain `===` leaks the token one character at a time to
anyone willing to measure response times.

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snapshots":[{ ... }]}'
```

Accepts at most 5000 snapshots per request. Reference rows are upserted,
snapshots are append only. The history is the product, so nothing is ever
overwritten.

## Schema

```
subject_area   code, name
course         subject_code, number, title          unique (subject_code, number)
section        course_id, term, class_id, activity  unique (term, class_id)
enrollment_snapshot
               section_id, captured_at, seats_total, seats_taken,
               waitlist_total, waitlist_taken, status
               index (section_id, captured_at)
```

That last index is the only one that matters. Every read is one section over a
time range, and without it the sequential scan becomes the bottleneck within
weeks of scraping.

## What is deliberately not built yet

- The real scraper. Discover the endpoints first, see the sibling repo.
- The seat release prediction model. Collect data first. A model trained on
  three days of history is a lie with a number attached.
- Email or Discord alerts.
- Auth. Nothing here needs a login yet.
