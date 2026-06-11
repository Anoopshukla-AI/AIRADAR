-- GTM Intelligence Dashboard - D1 Schema
-- Run this in Cloudflare D1 to create the database

CREATE TABLE IF NOT EXISTS companies (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  domain            TEXT NOT NULL UNIQUE,
  description       TEXT DEFAULT '',
  founded_year      INTEGER,
  headcount_range   TEXT DEFAULT '',
  industry          TEXT DEFAULT '',
  hq_country        TEXT DEFAULT '',
  hq_city           TEXT DEFAULT '',
  funding_total_usd REAL,
  funding_stage     TEXT DEFAULT '',
  last_funding_date TEXT,
  tech_stack        TEXT DEFAULT '[]',   -- JSON array of tech names
  icp_score         INTEGER,             -- 0-100, NULL = not yet scored
  icp_rationale     TEXT DEFAULT '',
  outreach_angle    TEXT DEFAULT '',
  linkedin_url      TEXT DEFAULT '',
  twitter_url       TEXT DEFAULT '',
  enriched_at       TEXT,               -- ISO timestamp
  source            TEXT DEFAULT '',    -- where we found this company
  is_ai_first       INTEGER DEFAULT 1,  -- 1 = AI-first startup
  tags              TEXT DEFAULT '[]',  -- JSON array of tags
  category          TEXT DEFAULT '',    -- AI Infrastructure, AI Agents, Vertical SaaS, etc.
  logo_url          TEXT DEFAULT '',    -- optional logo override (fallback to Clearbit)
  one_liner         TEXT DEFAULT '',    -- Anoop's custom 1-liner summary
  hubspot_id        TEXT,               -- ID of the synced company in HubSpot
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid      TEXT NOT NULL UNIQUE,
  email             TEXT,
  saved_icp         TEXT DEFAULT '',
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- Trigger to auto-update updated_at for users
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS user_leads (
  user_id           TEXT NOT NULL,
  company_id        INTEGER NOT NULL,
  status            TEXT DEFAULT 'New',
  saved_at          TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, company_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_alerts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT NOT NULL,
  name              TEXT NOT NULL,
  filters           TEXT NOT NULL,
  delivery_freq     TEXT DEFAULT 'weekly',
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS template_downloads (
  template_id       TEXT PRIMARY KEY,
  download_count    INTEGER DEFAULT 0
);


-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_icp_score ON companies(icp_score DESC);
CREATE INDEX IF NOT EXISTS idx_funding_stage ON companies(funding_stage);
CREATE INDEX IF NOT EXISTS idx_hq_country ON companies(hq_country);
CREATE INDEX IF NOT EXISTS idx_enriched_at ON companies(enriched_at);
CREATE INDEX IF NOT EXISTS idx_is_ai_first ON companies(is_ai_first);
CREATE INDEX IF NOT EXISTS idx_last_funding ON companies(last_funding_date DESC);
CREATE INDEX IF NOT EXISTS idx_category ON companies(category);
CREATE INDEX IF NOT EXISTS idx_hq_country_category ON companies(hq_country, category);

-- Trigger to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS update_companies_timestamp
AFTER UPDATE ON companies
BEGIN
  UPDATE companies SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Seed data: 15 real global AI-first startups for demo purposes
-- (all public information from Crunchbase/LinkedIn)
-- Core seed data (15 companies) — see seed_startups.sql for 500+ more
INSERT OR IGNORE INTO companies 
  (name, domain, description, founded_year, headcount_range, industry, hq_country, hq_city,
   funding_total_usd, funding_stage, last_funding_date, tech_stack, source, is_ai_first, tags, category, one_liner)
VALUES
  ('Aisera', 'aisera.com',
   'AI-powered service management platform automating IT, HR and customer service workflows using conversational AI and generative AI.',
   2017, '201-500', 'Enterprise AI', 'United States', 'Palo Alto',
   150000000, 'Series D', '2023-05-15',
   '["Python","AWS","Kubernetes","React","GPT-4"]',
   'seed', 1, '["enterprise-ai","service-management","llm","automation"]',
   'Enterprise AI', 'AI copilot for IT, HR and customer service — automates tickets before they reach humans'),

  ('Glean', 'glean.com',
   'Enterprise AI search and knowledge management platform connecting all company apps and enabling employees to find information and take action using natural language.',
   2019, '201-500', 'Enterprise AI', 'United States', 'Palo Alto',
   260000000, 'Series D', '2023-11-01',
   '["Python","GCP","React","LLM","RAG","Elasticsearch"]',
   'seed', 1, '["enterprise-search","rag","knowledge-management","llm"]',
   'Enterprise AI', 'Enterprise search that connects every app and lets employees find anything with plain English'),

  ('Writer', 'writer.com',
   'Full-stack generative AI platform for enterprises enabling teams to build AI apps, deploy AI agents, and generate content at scale with enterprise-grade controls.',
   2020, '101-200', 'Generative AI', 'United States', 'San Francisco',
   200000000, 'Series C', '2024-09-04',
   '["Python","AWS","React","Custom LLM","RAG"]',
   'seed', 1, '["generative-ai","enterprise","content","llm","agents"]',
   'Generative AI', 'Full-stack gen AI for enterprises — own LLM, agent builder, and content generation'),

  ('Cohere', 'cohere.com',
   'Enterprise AI platform providing LLMs, embeddings, and RAG solutions for businesses. Focused on secure, private AI deployment for Fortune 500 companies.',
   2019, '201-500', 'AI Infrastructure', 'Canada', 'Toronto',
   445000000, 'Series C', '2024-07-22',
   '["Python","GCP","AWS","Custom LLM","RAG","Docker","Kubernetes"]',
   'seed', 1, '["llm","enterprise","embeddings","rag","ai-infrastructure"]',
   'AI Infrastructure', 'Enterprise LLMs with private deployment — the secure alternative for Fortune 500'),

  ('Dust', 'dust.tt',
   'Platform for building custom AI agents and assistants connected to company data. Enables teams to deploy AI workers that understand their internal knowledge.',
   2022, '11-50', 'AI Agents', 'France', 'Paris',
   5000000, 'Seed', '2023-06-01',
   '["TypeScript","Next.js","PostgreSQL","OpenAI","Anthropic"]',
   'seed', 1, '["ai-agents","assistants","enterprise","automation"]',
   'AI Agents', 'Build custom AI agents connected to your company data — deploy AI workers in minutes'),

  ('Durable', 'durable.co',
   'AI-powered business platform that generates complete websites, CRM, and marketing content in seconds. Targeting small business owners and solopreneurs.',
   2021, '11-50', 'AI SaaS', 'Canada', 'Vancouver',
   14400000, 'Series A', '2023-03-14',
   '["React","Node.js","OpenAI","AWS","Stripe"]',
   'seed', 1, '["ai-website","smb","marketing","automation"]',
   'Vertical SaaS', 'AI generates your entire business — website, CRM, invoicing, and marketing in 30 seconds'),

  ('Bland AI', 'bland.ai',
   'AI phone calling platform enabling businesses to automate inbound and outbound phone calls using conversational AI that sounds human.',
   2023, '11-50', 'Conversational AI', 'United States', 'San Francisco',
   22000000, 'Series A', '2024-04-10',
   '["Python","WebRTC","OpenAI","Twilio","React"]',
   'seed', 1, '["voice-ai","calling","automation","conversational-ai","outbound"]',
   'Conversational AI', 'AI phone agents that sound human — automate millions of calls for sales and support'),

  ('Relevance AI', 'relevanceai.com',
   'No-code AI agent builder and workforce platform enabling teams to build, deploy and manage AI agents for sales, marketing, research and operations.',
   2020, '51-100', 'AI Agents', 'Australia', 'Sydney',
   15000000, 'Series A', '2024-02-28',
   '["Python","React","OpenAI","Anthropic","AWS"]',
   'seed', 1, '["ai-agents","no-code","automation","sales-ai","marketing-ai"]',
   'AI Agents', 'No-code AI workforce builder — drag-and-drop agents for sales, marketing, and ops'),

  ('Clay', 'clay.com',
   'GTM data enrichment and outbound automation platform connecting 75+ data providers with AI-powered research and personalisation for sales teams.',
   2017, '51-100', 'GTM Technology', 'United States', 'New York',
   46000000, 'Series B', '2024-02-08',
   '["React","Node.js","PostgreSQL","OpenAI","AWS"]',
   'seed', 1, '["gtm","enrichment","sales-automation","ai","outbound"]',
   'GTM Technology', '75+ data sources in one table — AI-powered enrichment and personalisation for outbound'),

  ('Cognition AI', 'cognition.ai',
   'AI software engineering company behind Devin, the first fully autonomous AI software engineer capable of completing complex coding tasks end-to-end.',
   2023, '11-50', 'AI Agents', 'United States', 'San Francisco',
   175000000, 'Series A', '2024-03-12',
   '["Python","Docker","Kubernetes","Custom LLM","AWS"]',
   'seed', 1, '["ai-agents","software-engineering","autonomous-ai","coding"]',
   'AI Agents', 'Devin: the first fully autonomous AI software engineer — writes, tests, and deploys code'),

  ('Synthesia', 'synthesia.io',
   'AI video generation platform enabling businesses to create professional videos with AI avatars from text in 140+ languages. Used by 50,000+ businesses.',
   2017, '201-500', 'Generative AI', 'United Kingdom', 'London',
   156700000, 'Series C', '2023-06-21',
   '["Python","React","GCP","Custom AI","Video Generation"]',
   'seed', 1, '["ai-video","avatars","content-generation","enterprise","multilingual"]',
   'AI Audio/Video', 'Type text, get a professional video with AI avatars in 140+ languages'),

  ('Mistral AI', 'mistral.ai',
   'European AI company building frontier open and enterprise LLMs. Provides API access and enterprise deployment for efficient, high-performance language models.',
   2023, '51-100', 'AI Infrastructure', 'France', 'Paris',
   1070000000, 'Series B', '2024-06-11',
   '["Python","CUDA","Custom LLM","Docker","Kubernetes"]',
   'seed', 1, '["llm","open-source","ai-infrastructure","european-ai","enterprise"]',
   'AI Infrastructure', 'Europe''s frontier AI lab — open-source LLMs rivalling GPT-4 at a fraction of the cost'),

  ('ElevenLabs', 'elevenlabs.io',
   'AI voice technology company providing the most realistic text-to-speech, voice cloning, and dubbing platform. Used by publishers, game studios, and content creators.',
   2022, '101-200', 'AI Audio', 'United States', 'New York',
   180000000, 'Series C', '2024-01-22',
   '["Python","React","AWS","Custom AI","WebAudio"]',
   'seed', 1, '["voice-ai","text-to-speech","audio","content-creation","dubbing"]',
   'AI Audio/Video', 'Most realistic AI voices — text-to-speech, voice cloning, and dubbing for any language'),

  ('Hebbia', 'hebbia.ai',
   'AI-powered research and analysis platform for knowledge workers in finance, law, and consulting. Enables complex multi-step research across thousands of documents.',
   2020, '51-100', 'Enterprise AI', 'United States', 'New York',
   130000000, 'Series B', '2024-07-09',
   '["Python","React","AWS","RAG","Custom LLM","Elasticsearch"]',
   'seed', 1, '["enterprise-ai","research","finance-ai","legal-ai","rag","documents"]',
   'Enterprise AI', 'AI analyst for finance, law, and consulting — multi-step research across 1000s of docs'),

  ('Unify', 'unify.ai',
   'AI router and LLM gateway enabling developers to optimise across 100+ LLMs for cost, speed, and quality. Automatic routing to the best model for each query.',
   2023, '11-50', 'AI Infrastructure', 'United Kingdom', 'London',
   5600000, 'Seed', '2024-03-01',
   '["Python","FastAPI","React","Multi-LLM","Docker"]',
   'seed', 1, '["llm-routing","ai-infrastructure","cost-optimisation","developer-tools"]',
   'AI Infrastructure', 'LLM router that auto-picks the best model per query — cut AI costs 80% without losing quality');
