-- BrainRam Admin Panel — tables for autonomous prospecting
-- Run on DFY project (nlcmhqevxpdttuhamjsj)

-- Copy templates (versioned WA/email cold copy)
create table if not exists copy_templates (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','email')),
  name text not null,
  subject text,                  -- só email
  body text not null,            -- usa {name}, {city}, {niche}
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Campanhas autônomas
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text not null default 'clínica odontológica',
  cities text[] not null default '{}',
  channels text[] not null default '{whatsapp}',   -- {whatsapp,email}
  copy_wa_id uuid references copy_templates(id),
  copy_email_id uuid references copy_templates(id),
  score_cut int not null default 70,
  daily_cap int not null default 20,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Histórico de execuções do worker
create table if not exists campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  leads_scraped int default 0,
  leads_sent_wa int default 0,
  leads_sent_email int default 0,
  status text default 'running',    -- running | done | error
  notes text
);

-- Flags globais (kill-switch)
create table if not exists system_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into system_flags (key, value) values ('dispatch_paused', 'false'::jsonb) on conflict do nothing;

-- Jobs de prospecção (fila que o worker consome)
create table if not exists prospect_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  query text not null,
  city text not null,
  limit_n int not null default 60,
  status text not null default 'pending',   -- pending | running | done | error
  leads_found int default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Indexes
create index if not exists idx_leads_score on leads (score desc);
create index if not exists idx_leads_sent on leads (sent_at);
create index if not exists idx_prospect_jobs_status on prospect_jobs (status);
create index if not exists idx_campaign_runs_campaign on campaign_runs (campaign_id);

-- Seed copy inicial (extraída do score-pplx-fast hardcoded system)
insert into copy_templates (channel, name, body, active) values
  ('whatsapp', 'default-wa-odonto',
   'Oi {name}! Vi a clínica em {city} e queria te mostrar em 1 min nossa atendente IA que responde paciente no WhatsApp 24/7 — qualifica, agenda e confirma. 7 dias grátis pra testar. Faz sentido dar uma olhada?\n\n— BrainRam',
   true)
on conflict do nothing;

insert into copy_templates (channel, name, subject, body, active) values
  ('email', 'default-email-odonto',
   'Ideia rápida pra {name}',
   'Oi! Vi que {name} atende em {city}. Desenvolvemos uma atendente IA que responde paciente no WhatsApp 24/7, qualifica, agenda e confirma — e aprende a rotina da clínica. 7 dias grátis pra experimentar. Se fizer sentido, respondo com o link aqui mesmo ou no wa.me/5519998760212.\n\n— BrainRam',
   true)
on conflict do nothing;
