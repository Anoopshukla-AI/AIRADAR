# GTM Intelligence Dashboard
## Global AI-First Startup Radar · Built by Anoop Shukla

Live pipeline tracking global AI-first startups with ICP scoring, enrichment data,
and GPT-generated outreach angles. Updates nightly via GitHub Actions.

**Stack:** Cloudflare Workers + D1 + Pages · Python enrichment pipeline · NVIDIA NIM (meta/llama-3.3-70b-instruct)

---

## Deployment — Step by Step

### Prerequisites
- Cloudflare account (free tier)
- GitHub account
- NVIDIA NIM API key (free tier at [build.nvidia.com](https://build.nvidia.com) — 1,000 free credits/month)
- Hunter.io API key (free tier, 50 requests/month)
- People Data Labs API key (free tier, 500 credits/month) — optional

---

### Step 1 — Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

---

### Step 2 — Create D1 Database

```bash
cd worker
wrangler d1 create gtm-intelligence-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`.

Then create the schema:
```bash
wrangler d1 execute gtm-intelligence-db --file=schema.sql
```

This creates the tables AND seeds 15 real AI-first startups for the demo.

---

### Step 3 — Set Worker Secrets

```bash
wrangler secret put NVIDIA_API_KEY
wrangler secret put HUNTER_API_KEY
wrangler secret put PDL_API_KEY        # optional but recommended
wrangler secret put PIPELINE_SECRET    # any random string, e.g. openssl rand -hex 32
```

---

### Step 4 — Deploy the Worker

```bash
cd worker
wrangler deploy
```

Note the Worker URL printed after deployment, e.g.:
`https://gtm-intelligence.YOUR_ACCOUNT.workers.dev`

Test it:
```bash
curl https://gtm-intelligence.YOUR_ACCOUNT.workers.dev/api/health
curl https://gtm-intelligence.YOUR_ACCOUNT.workers.dev/api/stats
curl https://gtm-intelligence.YOUR_ACCOUNT.workers.dev/api/companies?limit=5
```

---

### Step 5 — Deploy the Frontend to Cloudflare Pages

1. Push this entire repo to GitHub

2. Go to Cloudflare Dashboard → Pages → Create a project

3. Connect your GitHub repo

4. Build settings:
   - Build command: (leave empty)
   - Build output directory: `frontend`

5. Deploy

6. **After deployment:** Update the `WORKER_BASE` URL in `frontend/index.html`:
   ```javascript
   const WORKER_BASE = 'https://gtm-intelligence.YOUR_ACCOUNT.workers.dev';
   ```
   Commit and push — Cloudflare Pages auto-deploys.

---

### Step 6 — Set Up GitHub Actions Pipeline

1. In your GitHub repo → Settings → Secrets → Actions, add:
   - `NVIDIA_API_KEY`
   - `PDL_API_KEY`
   - `HUNTER_API_KEY`
   - `WORKER_URL` → your Cloudflare Worker URL
   - `PIPELINE_SECRET` → same secret you set on the Worker

2. The pipeline runs automatically every night at 2 AM UTC

3. Test a manual run: GitHub Actions tab → GTM Intelligence Pipeline → Run workflow

---

### Step 7 — Add Custom Domain (optional, free)

In Cloudflare Pages → your project → Custom domains:
- Add your domain (e.g. `gtm.clawoperator.in`)
- Cloudflare handles the SSL certificate automatically

---

## Local Development

**Worker:**
```bash
cd worker
npm install
wrangler dev --local --persist
```

**Frontend:**
```bash
cd frontend
python3 -m http.server 3000
# Open http://localhost:3000
# Make sure WORKER_BASE = 'http://localhost:8787' in index.html
```

**Pipeline:**
```bash
cd pipeline
pip install httpx
export NVIDIA_API_KEY=nvapi-...
export WORKER_URL=http://localhost:8787
export PIPELINE_SECRET=your-secret
python enrich.py
```

---

## Project Structure

```
gtm-dashboard/
├── worker/
│   ├── index.ts          # Cloudflare Worker API
│   ├── schema.sql        # D1 schema + seed data (15 AI startups)
│   └── wrangler.toml     # Cloudflare config
├── frontend/
│   └── index.html        # Single-file dashboard (Cloudflare Pages)
├── pipeline/
│   └── enrich.py         # Python enrichment pipeline
└── .github/
    └── workflows/
        └── pipeline.yml  # GitHub Actions nightly trigger
```

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET /api/companies` | List companies with filters |
| `GET /api/companies/:id` | Single company detail |
| `GET /api/stats` | Dashboard statistics |
| `GET /api/search?q=query` | Full-text search |
| `POST /api/pipeline/ingest` | Push enriched companies (requires auth) |
| `POST /api/pipeline/enrich/:id` | Score a single company with GPT |
| `GET /api/health` | Health check |

**Company list query params:**
- `page`, `limit` — pagination
- `sort` — `icp_score`, `last_funding_date`, `funding_total_usd`, `name`
- `order` — `ASC` or `DESC`
- `stage` — `Seed`, `Series A`, `Series B`, etc.
- `min_score`, `max_score` — ICP score range filter

---

## Estimated Monthly Cost

| Service | Usage | Cost |
|---|---|---|
| Cloudflare Workers | 100k req/day free | $0 |
| Cloudflare D1 | 5GB free | $0 |
| Cloudflare Pages | Unlimited bandwidth | $0 |
| GitHub Actions | 2000 min/month free | $0 |
| OpenAI GPT-4o-mini | ~~60 companies~~ | ~~$0.30~~ |
| NVIDIA NIM (llama-3.3-70b) | 1,000 free credits/month | **$0** |
| Hunter.io | Free tier (50 req/month) | $0 |
| People Data Labs | Free tier (500 credits) | $0 |
| **Total** | | **~$0/month** |

---

## Built by Anoop Shukla
GTM Engineer · AI Automation Engineer · Gurugram, India
- GitHub: github.com/Anoopshukla-AI
- Platform: clawoperator.ct.ws
- Podcast: Hindi AI Automation (Spotify)
