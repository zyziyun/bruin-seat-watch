# Deploy: from empty folder to public URL

This is the exact sequence that produced https://bruin-seat-watch.vercel.app.
Every command here was run, not guessed.

Accounts needed, all free: GitHub, Vercel, Neon.

## 0. Tools

```bash
node -v          # 20 or newer, 22 recommended
pnpm -v
gh auth login    # GitHub CLI
```

## 1. Scaffold and run locally

```bash
npx create-next-app@latest bruin-seat-watch \
  --typescript --tailwind --app --eslint --use-pnpm --src-dir
cd bruin-seat-watch
pnpm dev         # http://localhost:3000
```

## 2. Put it on GitHub

```bash
git add .
git commit -m "initial scaffold"
gh repo create bruin-seat-watch --public --source=. --push
```

## 3. Deploy before building any features

```bash
pnpm dlx vercel login
pnpm dlx vercel link --yes --project bruin-seat-watch
pnpm dlx vercel --prod --yes
```

You now have a live URL. Do this on day one, with nothing on the page. Every
later problem is then a small diff away from something that worked, instead of a
week of local work meeting deployment for the first time.

## 4. Create the database

Neon, free tier. Scale to zero, and it does not pause on inactivity the way
Supabase does, which matters when you want to demo the site three weeks later.

```bash
npx neonctl@latest init
```

Copy the connection string. It looks like:

```
postgresql://USER:PASSWORD@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Alternatively use the Vercel marketplace integration, but note it requires
accepting Neon's legal terms in a browser, which no CLI can do for you:

```bash
vercel integration add neon
```

## 5. Wire up secrets

Generate the ingest token:

```bash
openssl rand -hex 32
```

Locally, in `.env.local`, which is gitignored:

```
DATABASE_URL=postgresql://...
INGEST_TOKEN=<the 64 char hex string>
```

On Vercel, for all three environments:

```bash
for env in production preview development; do
  printf '%s' "$DATABASE_URL" | vercel env add DATABASE_URL $env --force
  printf '%s' "$INGEST_TOKEN" | vercel env add INGEST_TOKEN $env --force
done
vercel env ls
```

Use `printf` rather than `echo`. `echo` appends a newline, which becomes part of
the secret, and you then spend an hour debugging a token that looks identical to
the one that works.

## 6. Create the tables

```bash
pnpm db:setup --seed
```

Verify against the real database, not against the app:

```bash
psql "$DATABASE_URL" -c "select count(*) from enrollment_snapshot;"
```

## 7. Redeploy so the app picks up the environment variables

```bash
pnpm dlx vercel --prod --yes
curl -s "https://bruin-seat-watch.vercel.app/api/sections?q=COM%20SCI" | head -c 300
```

Environment variables are read at build and boot. Adding one does not update a
running deployment. If the site still says the database is missing, this step is
why.

## 8. The scraper repo

```bash
cd ../seat-scraper
git init && git add -A && git commit -m "feat: add scraper"
gh repo create seat-scraper --public --source=. --push
```

Secrets for GitHub Actions:

```bash
gh secret set API_BASE     --body "https://bruin-seat-watch.vercel.app"
gh secret set INGEST_TOKEN --body "<same token as Vercel>"
gh secret list
```

## 9. Prove the loop before trusting the schedule

```bash
gh workflow run scrape.yml
gh run list --limit 1
gh run view <run-id> --log | grep inserted
psql "$DATABASE_URL" -c "select count(*) from enrollment_snapshot;"
```

The count must go up. That is the whole system verified: GitHub Actions runs
Python, Python posts to Vercel, Vercel writes to Neon, and the public API reads
it back.

## Continuous deployment from here

`git push` to `main` redeploys automatically. Test it once so you believe it:

```bash
git commit -am "update landing copy" && git push
```

## Things that will actually go wrong

| Symptom | Cause |
|---|---|
| Site says "DATABASE_URL is not set" after you set it | Did not redeploy. See step 7. |
| 401 from `/api/ingest` | Token mismatch, usually a trailing newline from `echo` |
| Scraped data stops after two months | GitHub disables scheduled workflows after 60 days without repo activity. One email is the only warning. |
| Snapshots are not evenly 15 minutes apart | Normal. Scheduled runs are best effort and get delayed 10 to 30 minutes under load. This is why the scraper stamps `captured_at` itself. |
| Local script says DATABASE_URL missing while `.env.local` exists | Next.js loads `.env.local` automatically, plain Node scripts do not. Load it explicitly with dotenv. |
| Chart shows axes but no lines | Recharts animates by growing a clip path from width 0. If the animation does not run, the data is drawn and then clipped away. Set `isAnimationActive={false}`. |
| Build fails on `LayoutProps` | Next 16 generates that type into `.next/types`. Run `pnpm build` once before `tsc --noEmit`. |

## Why not Google Cloud

Checked, because it is a reasonable question. It is not cheaper here.

- Cloud SQL for Postgres has **no free tier**. The smallest shared core instance
  is roughly 7 to 10 dollars a month before storage, and it carries no SLA.
- Cloud Run's free tier is generous, but it still needs a database, so you end
  up at Cloud Run plus Neon, which is Vercel plus Neon with more configuration.
- The only genuinely free GCP path is the always free `e2-micro` VM in
  us-west1, us-central1 or us-east1, self managing Postgres on it. That is 1 GB
  of RAM, 30 GB of standard disk, and all the operations work is yours.

For a project whose interesting part is the dataset and the model, spending the
time on VM maintenance is a bad trade. Revisit if the free tiers run out, and
the first fix then is storing fewer redundant rows, not a bigger host.
