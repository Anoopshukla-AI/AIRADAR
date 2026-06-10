// GTM Intelligence Dashboard - Cloudflare Worker API
// Handles: company CRUD, filtering, search, cron trigger for pipeline
// AI scoring powered by NVIDIA NIM (meta/llama-3.3-70b-instruct — free tier)

export interface Env {
  DB: D1Database;
  NVIDIA_API_KEY: string;    // Free at build.nvidia.com
  HUNTER_API_KEY: string;
  PDL_API_KEY: string;      // People Data Labs
  PIPELINE_SECRET: string;  // Secret for triggering pipeline from GitHub Actions
}

interface Company {
  id?: number;
  name: string;
  domain: string;
  description: string;
  founded_year: number | null;
  headcount_range: string;
  industry: string;
  hq_country: string;
  hq_city: string;
  funding_total_usd: number | null;
  funding_stage: string;
  last_funding_date: string | null;
  tech_stack: string;         // JSON array string
  icp_score: number | null;
  icp_rationale: string;
  outreach_angle: string;
  linkedin_url: string;
  twitter_url: string;
  enriched_at: string | null;
  source: string;             // where we found them
  is_ai_first: number;        // 1 = yes
  tags: string;               // JSON array string
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function error(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ── ROUTER ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // GET /api/companies - list with filters
    if (path === "/api/companies" && request.method === "GET") {
      return handleGetCompanies(request, env);
    }

    // GET /api/companies/:id
    if (path.match(/^\/api\/companies\/\d+$/) && request.method === "GET") {
      const id = parseInt(path.split("/")[3]);
      return handleGetCompany(id, env);
    }

    // GET /api/stats - dashboard stats
    if (path === "/api/stats" && request.method === "GET") {
      return handleGetStats(env);
    }

    // GET /api/search
    if (path === "/api/search" && request.method === "GET") {
      return handleSearch(request, env);
    }

    // POST /api/companies/add - user adds a new company
    if (path === "/api/companies/add" && request.method === "POST") {
      return handleAddCompany(request, env);
    }

    // POST /api/score-custom - User-defined ICP scoring
    if (path === "/api/score-custom" && request.method === "POST") {
      return handleScoreCustom(request, env);
    }

    // GET /api/user/profile - Fetch saved ICP
    if (path === "/api/user/profile" && request.method === "GET") {
      return handleGetUserProfile(request, env);
    }

    // POST /api/user/profile - Update saved ICP
    if (path === "/api/user/profile" && request.method === "POST") {
      return handleUpdateUserProfile(request, env);
    }

    // GET /api/leads - Fetch user's saved leads
    if (path === "/api/leads" && request.method === "GET") {
      return handleGetLeads(request, env);
    }

    // POST /api/leads - Save or update a lead
    if (path === "/api/leads" && request.method === "POST") {
      return handleSaveLead(request, env);
    }

    // POST /api/templates/download - Increment template downloads
    if (path === "/api/templates/download" && request.method === "POST") {
      return handleTemplateDownload(request, env);
    }

    // POST /api/pipeline/ingest - called by GitHub Actions with pipeline secret
    if (path === "/api/pipeline/ingest" && request.method === "POST") {
      return handleIngest(request, env);
    }

    // POST /api/pipeline/enrich/:id - enrich a single company
    if (path.match(/^\/api\/pipeline\/enrich\/\d+$/) && request.method === "POST") {
      const id = parseInt(path.split("/")[4]);
      return handleEnrichSingle(id, env);
    }

    // GET /api/health
    if (path === "/api/health") {
      return json({ status: "ok", timestamp: new Date().toISOString() });
    }

    return error("Not found", 404);
  },

  // Cron trigger - runs nightly to kick off pipeline
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Cron trigger fired:", event.cron);
    // Mark stale companies for re-enrichment (enriched > 7 days ago)
    await env.DB.prepare(`
      UPDATE companies 
      SET icp_score = NULL, enriched_at = NULL 
      WHERE enriched_at < datetime('now', '-7 days')
    `).run();
    console.log("Marked stale companies for re-enrichment");
  },
};

// ── GET COMPANIES ─────────────────────────────────────────────────────────────
async function handleGetCompanies(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  // Filters
  const minScore = url.searchParams.get("min_score");
  const maxScore = url.searchParams.get("max_score");
  const stage = url.searchParams.get("stage");
  const country = url.searchParams.get("country");
  const sortBy = url.searchParams.get("sort") || "icp_score";
  const sortOrder = url.searchParams.get("order") || "DESC";

  let where = "WHERE is_ai_first = 1";
  const params: (string | number)[] = [];

  if (minScore) { where += " AND icp_score >= ?"; params.push(parseInt(minScore)); }
  if (maxScore) { where += " AND icp_score <= ?"; params.push(parseInt(maxScore)); }
  if (stage && stage !== "all") { where += " AND funding_stage = ?"; params.push(stage); }
  if (country && country !== "all") { where += " AND hq_country = ?"; params.push(country); }

  const allowedSort = ["icp_score", "enriched_at", "funding_total_usd", "name", "last_funding_date"];
  const safeSort = allowedSort.includes(sortBy) ? sortBy : "icp_score";
  const safeOrder = sortOrder === "ASC" ? "ASC" : "DESC";

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM companies ${where}`
  ).bind(...params).first<{ total: number }>();

  const companies = await env.DB.prepare(
    `SELECT * FROM companies ${where} 
     ORDER BY ${safeSort} ${safeOrder} NULLS LAST
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all<Company>();

  return json({
    data: companies.results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
}

// ── GET SINGLE COMPANY ────────────────────────────────────────────────────────
async function handleGetCompany(id: number, env: Env): Promise<Response> {
  const company = await env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  ).bind(id).first<Company>();

  if (!company) return error("Company not found", 404);
  return json(company);
}

// ── ADD NEW COMPANY ────────────────────────────────────────────────────────
async function handleAddCompany(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { domain: string };
  if (!body?.domain) return error("Domain is required");

  let domain = body.domain.toLowerCase().trim();
  // Strip protocols and paths
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // Check if exists
  const existing = await env.DB.prepare("SELECT id FROM companies WHERE domain = ?").bind(domain).first<{id: number}>();
  if (existing) {
    return error("Company already exists in the database. Use search to find it.", 400);
  }

  // Basic HTML fetch to get Title and Meta Description
  let title = domain;
  let description = "";
  try {
    const res = await fetch(`https://${domain}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }});
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      // take first part of title
      title = titleMatch[1].split(/[|-]/)[0].trim();
    }
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                      html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
    if (descMatch) description = descMatch[1].trim();
  } catch (e) {
    console.error("Failed to fetch domain info:", e);
  }

  // Create shell record
  const result = await env.DB.prepare(`
    INSERT INTO companies (
      name, domain, description, is_ai_first, source
    ) VALUES (?, ?, ?, ?, ?) RETURNING id
  `).bind(title, domain, description, 1, 'user_added').first<{id: number}>();

  if (!result || !result.id) return error("Failed to insert company");

  // Run enrichment synchronously
  try {
    const company = await env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(result.id).first<Company>();
    if (company) {
      const enriched = await enrichWithNvidiaNim(company, env.NVIDIA_API_KEY);
      await env.DB.prepare(`
        UPDATE companies SET
          icp_score = ?, icp_rationale = ?, outreach_angle = ?, enriched_at = ?
        WHERE id = ?
      `).bind(
        enriched.icp_score ?? null, enriched.icp_rationale ?? null,
        enriched.outreach_angle ?? null, new Date().toISOString(), result.id
      ).run();
    }
  } catch (e) {
    console.error("Enrichment failed for added company:", e);
  }

  // Fetch and return the fully updated company
  const finalCompany = await env.DB.prepare("SELECT * FROM companies WHERE id = ?").bind(result.id).first<Company>();
  return json(finalCompany);
}

// ── CUSTOM SCORER ────────────────────────────────────────────────────────
async function scoreSingleDomain(domainInput: string, custom_icp: string, env: Env) {
  let domain = domainInput.toLowerCase().trim();
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // 1. Fetch domain context
  let title = domain;
  let description = "";
  try {
    const res = await fetch(`https://${domain}`, { headers: { 'User-Agent': 'Mozilla/5.0' }});
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].split(/[|-]/)[0].trim();
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                      html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
    if (descMatch) description = descMatch[1].trim();
  } catch (e) {
    console.error(`Failed to fetch domain info for ${domain}:`, e);
  }

  // 2. Score with NVIDIA NIM
  const prompt = `
You are an expert Go-To-Market analyst. Evaluate the following company against a custom Ideal Customer Profile (ICP).

Target Company: ${title} (${domain})
Context: ${description}

User's Custom ICP:
"${custom_icp}"

Please evaluate how well this company fits the custom ICP. Break down the fit into 10 distinct binary signals (true/false) based on the context and ICP.

Output ONLY valid JSON matching this schema exactly:
{
  "icp_score": number (0-100),
  "signal_breakdown": [
    { "signal": "Brief description of signal 1", "met": true }
  ],
  "rationale": "Short explanation of the score"
}
Ensure there are exactly 10 signals in the signal_breakdown array.
`;

  try {
    const aiResp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.3-70b-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" }
      })
    });

    if (!aiResp.ok) throw new Error("NVIDIA NIM API error: " + await aiResp.text());
    
    const data = await aiResp.json() as any;
    let content = data.choices[0].message.content.trim();
    if (content.startsWith("\`\`\`json")) {
      content = content.replace(/^\`\`\`json\\n/, "").replace(/\\n\`\`\`$/, "");
    }
    
    const result = JSON.parse(content);
    return {
      domain,
      name: title,
      description,
      icp_score: result.icp_score,
      signal_breakdown: result.signal_breakdown,
      rationale: result.rationale
    };
  } catch (e: any) {
    console.error(`Custom scoring failed for ${domain}:`, e);
    return { domain, name: title, error: e.message };
  }
}

async function handleScoreCustom(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { domain?: string, domains?: string[], custom_icp: string };
  if ((!body?.domain && !body?.domains) || !body?.custom_icp) return error("Domain(s) and custom_icp are required", 400);

  const targets = body.domains || (body.domain ? [body.domain] : []);
  if (targets.length > 50) return error("Max 50 domains allowed for bulk scoring", 400);

  // Process concurrently
  const results = await Promise.all(targets.map(d => scoreSingleDomain(d, body.custom_icp, env)));

  // If a single domain was requested, return the single object to preserve backwards compatibility
  if (body.domain && !body.domains) {
    if (results[0].error) return error("Custom scoring failed: " + results[0].error, 500);
    return json(results[0]);
  }

  // Otherwise return array for bulk
  return json({ results });
}

// ── AUTH & USER PROFILES ──────────────────────────────────────────────────
function getAuthUid(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    // Basic JWT decode (For production, verify signature via Google's public keys using jose!)
    const payloadBase64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = decodeURIComponent(atob(payloadBase64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const payload = JSON.parse(payloadJson);
    return payload.user_id || payload.sub;
  } catch (e) {
    return null;
  }
}

async function handleGetUserProfile(request: Request, env: Env): Promise<Response> {
  const uid = getAuthUid(request);
  if (!uid) return error("Unauthorized", 401);

  let user = await env.DB.prepare("SELECT * FROM users WHERE firebase_uid = ?").bind(uid).first();
  if (!user) {
    await env.DB.prepare("INSERT INTO users (firebase_uid) VALUES (?)").bind(uid).run();
    user = await env.DB.prepare("SELECT * FROM users WHERE firebase_uid = ?").bind(uid).first();
  }
  return json(user);
}

async function handleUpdateUserProfile(request: Request, env: Env): Promise<Response> {
  const uid = getAuthUid(request);
  if (!uid) return error("Unauthorized", 401);

  const body = await request.json() as { saved_icp: string };
  await env.DB.prepare("UPDATE users SET saved_icp = ? WHERE firebase_uid = ?").bind(body.saved_icp || '', uid).run();
  
  const user = await env.DB.prepare("SELECT * FROM users WHERE firebase_uid = ?").bind(uid).first();
  return json(user);
}

// ── CRM & LEADS ─────────────────────────────────────────────────────────────
async function handleGetLeads(request: Request, env: Env): Promise<Response> {
  const uid = getAuthUid(request);
  if (!uid) return error("Unauthorized", 401);

  const leads = await env.DB.prepare(`
    SELECT c.*, ul.status, ul.saved_at 
    FROM user_leads ul 
    JOIN companies c ON ul.company_id = c.id 
    WHERE ul.user_id = ?
    ORDER BY ul.saved_at DESC
  `).bind(uid).all();
  return json(leads.results);
}

async function handleSaveLead(request: Request, env: Env): Promise<Response> {
  const uid = getAuthUid(request);
  if (!uid) return error("Unauthorized", 401);

  const body = await request.json() as { company_id: number, status?: string };
  if (!body.company_id) return error("Missing company_id", 400);

  await env.DB.prepare(`
    INSERT INTO user_leads (user_id, company_id, status) 
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, company_id) DO UPDATE SET status = excluded.status
  `).bind(uid, body.company_id, body.status || 'New').run();

  return json({ success: true });
}

// ── TEMPLATES ───────────────────────────────────────────────────────────────
async function handleTemplateDownload(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { template_id: string };
  if (!body.template_id) return error("Missing template_id", 400);

  await env.DB.prepare(`
    INSERT INTO template_downloads (template_id, download_count) 
    VALUES (?, 1)
    ON CONFLICT(template_id) DO UPDATE SET download_count = template_downloads.download_count + 1
  `).bind(body.template_id).run();

  return json({ success: true });
}

// ── STATS ────────────────────────────────────────────────────────────────────
async function handleGetStats(env: Env): Promise<Response> {
  const [total, enriched, avgScore, topStages, topCountries] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as n FROM companies WHERE is_ai_first = 1").first<{n:number}>(),
    env.DB.prepare("SELECT COUNT(*) as n FROM companies WHERE icp_score IS NOT NULL").first<{n:number}>(),
    env.DB.prepare("SELECT ROUND(AVG(icp_score),1) as avg FROM companies WHERE icp_score IS NOT NULL").first<{avg:number}>(),
    env.DB.prepare(`
      SELECT funding_stage, COUNT(*) as count 
      FROM companies WHERE is_ai_first = 1 AND funding_stage != ''
      GROUP BY funding_stage ORDER BY count DESC LIMIT 6
    `).all(),
    env.DB.prepare(`
      SELECT hq_country, COUNT(*) as count 
      FROM companies WHERE is_ai_first = 1 AND hq_country != ''
      GROUP BY hq_country ORDER BY count DESC LIMIT 8
    `).all(),
  ]);

  return json({
    total_companies: total?.n || 0,
    enriched_companies: enriched?.n || 0,
    avg_icp_score: avgScore?.avg || 0,
    top_stages: topStages.results,
    top_countries: topCountries.results,
    last_updated: new Date().toISOString(),
  });
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
async function handleSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return error("Query too short");

  const results = await env.DB.prepare(`
    SELECT * FROM companies 
    WHERE is_ai_first = 1 AND (
      name LIKE ? OR domain LIKE ? OR description LIKE ? OR tags LIKE ?
    )
    ORDER BY icp_score DESC NULLS LAST
    LIMIT 20
  `).bind(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`).all<Company>();

  return json({ data: results.results, query: q });
}

// ── INGEST (called by GitHub Actions pipeline) ────────────────────────────────
async function handleIngest(request: Request, env: Env): Promise<Response> {
  // Verify pipeline secret
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.PIPELINE_SECRET}`) {
    return error("Unauthorized", 401);
  }

  const body = await request.json() as { companies: Partial<Company>[] };
  if (!body.companies || !Array.isArray(body.companies)) {
    return error("Expected { companies: [...] }");
  }

  let inserted = 0;
  let updated = 0;

  for (const company of body.companies) {
    if (!company.domain) continue;

    const existing = await env.DB.prepare(
      "SELECT id FROM companies WHERE domain = ?"
    ).bind(company.domain).first<{ id: number }>();

    if (existing) {
      await env.DB.prepare(`
        UPDATE companies SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          headcount_range = COALESCE(?, headcount_range),
          funding_stage = COALESCE(?, funding_stage),
          funding_total_usd = COALESCE(?, funding_total_usd),
          last_funding_date = COALESCE(?, last_funding_date),
          tech_stack = COALESCE(?, tech_stack),
          tags = COALESCE(?, tags),
          source = COALESCE(?, source)
        WHERE domain = ?
      `).bind(
        company.name, company.description, company.headcount_range,
        company.funding_stage, company.funding_total_usd, company.last_funding_date,
        company.tech_stack, company.tags, company.source, company.domain
      ).run();
      updated++;
    } else {
      await env.DB.prepare(`
        INSERT INTO companies (
          name, domain, description, founded_year, headcount_range,
          industry, hq_country, hq_city, funding_total_usd, funding_stage,
          last_funding_date, tech_stack, icp_score, icp_rationale, outreach_angle,
          linkedin_url, twitter_url, enriched_at, source, is_ai_first, tags
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        company.name || "", company.domain, company.description || "",
        company.founded_year || null, company.headcount_range || "",
        company.industry || "", company.hq_country || "", company.hq_city || "",
        company.funding_total_usd || null, company.funding_stage || "",
        company.last_funding_date || null, company.tech_stack || "[]",
        company.icp_score || null, company.icp_rationale || "",
        company.outreach_angle || "", company.linkedin_url || "",
        company.twitter_url || "", company.enriched_at || null,
        company.source || "pipeline", 1, company.tags || "[]"
      ).run();
      inserted++;
    }
  }

  return json({ inserted, updated, total: inserted + updated });
}

// ── ENRICH SINGLE COMPANY ────────────────────────────────────────────────────
async function handleEnrichSingle(id: number, env: Env): Promise<Response> {
  const company = await env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  ).bind(id).first<Company>();

  if (!company) return error("Company not found", 404);

  try {
    const enriched = await enrichWithNvidiaNim(company, env.NVIDIA_API_KEY);

    await env.DB.prepare(`
      UPDATE companies SET
        icp_score = ?, icp_rationale = ?, outreach_angle = ?, enriched_at = ?
      WHERE id = ?
    `).bind(
      enriched.icp_score, enriched.icp_rationale,
      enriched.outreach_angle, new Date().toISOString(), id
    ).run();

    return json({ success: true, ...enriched });
  } catch (e) {
    return error(`Enrichment failed: ${e}`);
  }
}

// ── NVIDIA NIM SCORING ───────────────────────────────────────────────────────
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL    = "meta/llama-3.3-70b-instruct"; // Best free model on NIM

async function enrichWithNvidiaNim(
  company: Company,
  apiKey: string
): Promise<{ icp_score: number; icp_rationale: string; outreach_angle: string }> {
  const prompt = `You are a GTM analyst scoring AI-first startups for outbound sales targeting.

Company data:
- Name: ${company.name}
- Domain: ${company.domain}  
- Description: ${company.description}
- Industry: ${company.industry}
- Headcount: ${company.headcount_range}
- Funding Stage: ${company.funding_stage}
- Funding Total: $${company.funding_total_usd ? (company.funding_total_usd / 1000000).toFixed(1) + "M" : "Unknown"}
- Last Funding: ${company.last_funding_date || "Unknown"}
- HQ: ${company.hq_city}, ${company.hq_country}
- Tech Stack: ${company.tech_stack}
- Tags: ${company.tags}

Score this company as an ICP target for a B2B AI automation or GTM tooling vendor.

Scoring signals (weight each 1-10):
1. AI-first business model (core revenue from AI products)
2. Growth stage appropriate (Seed to Series B = highest value)
3. Likely has GTM or sales motion (not pure developer tools)
4. Headcount indicates buying capacity (10-500 ideal)
5. Recent funding (last 12 months = highest urgency)
6. Global market presence (not hyper-local)
7. Tech sophistication (uses modern stack)
8. Clear pain points AI automation solves
9. Geographic accessibility for outbound
10. Company momentum signals

Return ONLY valid JSON, no markdown:
{
  "icp_score": <integer 0-100>,
  "icp_rationale": "<2-3 sentences explaining the score>",
  "outreach_angle": "<1 specific, personalised outreach opening sentence a sales rep could send today>"
}`;

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  const data = await response.json() as {
    choices: { message: { content: string } }[]
  };
  const content = data.choices[0].message.content.trim();

  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON if model added any wrapper text
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse NVIDIA NIM response as JSON");
  }
}
