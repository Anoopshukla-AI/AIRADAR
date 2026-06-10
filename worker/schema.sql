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

-- Trigger to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS update_companies_timestamp
AFTER UPDATE ON companies
BEGIN
  UPDATE companies SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Seed data: 15 real global AI-first startups for demo purposes
-- (all public information from Crunchbase/LinkedIn)
INSERT OR IGNORE INTO companies 
  (name, domain, description, founded_year, headcount_range, industry, hq_country, hq_city,
   funding_total_usd, funding_stage, last_funding_date, tech_stack, source, is_ai_first, tags)
VALUES
  ('Aisera', 'aisera.com',
   'AI-powered service management platform automating IT, HR and customer service workflows using conversational AI and generative AI.',
   2017, '201-500', 'Enterprise AI', 'United States', 'Palo Alto',
   150000000, 'Series D', '2023-05-15',
   '["Python","AWS","Kubernetes","React","GPT-4"]',
   'seed', 1, '["enterprise-ai","service-management","llm","automation"]'),

  ('Glean', 'glean.com',
   'Enterprise AI search and knowledge management platform connecting all company apps and enabling employees to find information and take action using natural language.',
   2019, '201-500', 'Enterprise AI', 'United States', 'Palo Alto',
   260000000, 'Series D', '2023-11-01',
   '["Python","GCP","React","LLM","RAG","Elasticsearch"]',
   'seed', 1, '["enterprise-search","rag","knowledge-management","llm"]'),

  ('Writer', 'writer.com',
   'Full-stack generative AI platform for enterprises enabling teams to build AI apps, deploy AI agents, and generate content at scale with enterprise-grade controls.',
   2020, '101-200', 'Generative AI', 'United States', 'San Francisco',
   200000000, 'Series C', '2024-09-04',
   '["Python","AWS","React","Custom LLM","RAG"]',
   'seed', 1, '["generative-ai","enterprise","content","llm","agents"]'),

  ('Cohere', 'cohere.com',
   'Enterprise AI platform providing LLMs, embeddings, and RAG solutions for businesses. Focused on secure, private AI deployment for Fortune 500 companies.',
   2019, '201-500', 'AI Infrastructure', 'Canada', 'Toronto',
   445000000, 'Series C', '2024-07-22',
   '["Python","GCP","AWS","Custom LLM","RAG","Docker","Kubernetes"]',
   'seed', 1, '["llm","enterprise","embeddings","rag","ai-infrastructure"]'),

  ('Dust', 'dust.tt',
   'Platform for building custom AI agents and assistants connected to company data. Enables teams to deploy AI workers that understand their internal knowledge.',
   2022, '11-50', 'AI Agents', 'France', 'Paris',
   5000000, 'Seed', '2023-06-01',
   '["TypeScript","Next.js","PostgreSQL","OpenAI","Anthropic"]',
   'seed', 1, '["ai-agents","assistants","enterprise","automation"]'),

  ('Durable', 'durable.co',
   'AI-powered business platform that generates complete websites, CRM, and marketing content in seconds. Targeting small business owners and solopreneurs.',
   2021, '11-50', 'AI SaaS', 'Canada', 'Vancouver',
   14400000, 'Series A', '2023-03-14',
   '["React","Node.js","OpenAI","AWS","Stripe"]',
   'seed', 1, '["ai-website","smb","marketing","automation"]'),

  ('Bland AI', 'bland.ai',
   'AI phone calling platform enabling businesses to automate inbound and outbound phone calls using conversational AI that sounds human.',
   2023, '11-50', 'Conversational AI', 'United States', 'San Francisco',
   22000000, 'Series A', '2024-04-10',
   '["Python","WebRTC","OpenAI","Twilio","React"]',
   'seed', 1, '["voice-ai","calling","automation","conversational-ai","outbound"]'),

  ('Relevance AI', 'relevanceai.com',
   'No-code AI agent builder and workforce platform enabling teams to build, deploy and manage AI agents for sales, marketing, research and operations.',
   2020, '51-100', 'AI Agents', 'Australia', 'Sydney',
   15000000, 'Series A', '2024-02-28',
   '["Python","React","OpenAI","Anthropic","AWS"]',
   'seed', 1, '["ai-agents","no-code","automation","sales-ai","marketing-ai"]'),

  ('Clay', 'clay.com',
   'GTM data enrichment and outbound automation platform connecting 75+ data providers with AI-powered research and personalisation for sales teams.',
   2017, '51-100', 'GTM Technology', 'United States', 'New York',
   46000000, 'Series B', '2024-02-08',
   '["React","Node.js","PostgreSQL","OpenAI","AWS"]',
   'seed', 1, '["gtm","enrichment","sales-automation","ai","outbound"]'),

  ('Cognition AI', 'cognition.ai',
   'AI software engineering company behind Devin, the first fully autonomous AI software engineer capable of completing complex coding tasks end-to-end.',
   2023, '11-50', 'AI Agents', 'United States', 'San Francisco',
   175000000, 'Series A', '2024-03-12',
   '["Python","Docker","Kubernetes","Custom LLM","AWS"]',
   'seed', 1, '["ai-agents","software-engineering","autonomous-ai","coding"]'),

  ('Synthesia', 'synthesia.io',
   'AI video generation platform enabling businesses to create professional videos with AI avatars from text in 140+ languages. Used by 50,000+ businesses.',
   2017, '201-500', 'Generative AI', 'United Kingdom', 'London',
   156700000, 'Series C', '2023-06-21',
   '["Python","React","GCP","Custom AI","Video Generation"]',
   'seed', 1, '["ai-video","avatars","content-generation","enterprise","multilingual"]'),

  ('Mistral AI', 'mistral.ai',
   'European AI company building frontier open and enterprise LLMs. Provides API access and enterprise deployment for efficient, high-performance language models.',
   2023, '51-100', 'AI Infrastructure', 'France', 'Paris',
   1070000000, 'Series B', '2024-06-11',
   '["Python","CUDA","Custom LLM","Docker","Kubernetes"]',
   'seed', 1, '["llm","open-source","ai-infrastructure","european-ai","enterprise"]'),

  ('ElevenLabs', 'elevenlabs.io',
   'AI voice technology company providing the most realistic text-to-speech, voice cloning, and dubbing platform. Used by publishers, game studios, and content creators.',
   2022, '101-200', 'AI Audio', 'United States', 'New York',
   180000000, 'Series C', '2024-01-22',
   '["Python","React","AWS","Custom AI","WebAudio"]',
   'seed', 1, '["voice-ai","text-to-speech","audio","content-creation","dubbing"]'),

  ('Hebbia', 'hebbia.ai',
   'AI-powered research and analysis platform for knowledge workers in finance, law, and consulting. Enables complex multi-step research across thousands of documents.',
   2020, '51-100', 'Enterprise AI', 'United States', 'New York',
   130000000, 'Series B', '2024-07-09',
   '["Python","React","AWS","RAG","Custom LLM","Elasticsearch"]',
   'seed', 1, '["enterprise-ai","research","finance-ai","legal-ai","rag","documents"]'),

  ('Unify', 'unify.ai',
   'AI router and LLM gateway enabling developers to optimise across 100+ LLMs for cost, speed, and quality. Automatic routing to the best model for each query.',
   2023, '11-50', 'AI Infrastructure', 'United Kingdom', 'London',
   5600000, 'Seed', '2024-03-01',
   '["Python","FastAPI","React","Multi-LLM","Docker"]',
   'seed', 1, '["llm-routing","ai-infrastructure","cost-optimisation","developer-tools"]');
