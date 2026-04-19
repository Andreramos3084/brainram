-- Tabelas do scraper engine no Supabase (txtwmvwuhwpykbqbvhdo)

create table if not exists public.scraper_leads (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  query text not null,
  city text not null,
  name text not null,
  phone text,
  address text,
  website text,
  category text,
  rating numeric,
  reviews integer,
  "mapsUrl" text unique,
  "placeId" text,
  instagram jsonb,
  website_signals jsonb,
  score integer,
  score_reason text,
  gancho_pessoal text,
  mensagem_cold text,
  status text default 'new',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_scraper_leads_query on public.scraper_leads (query);
create index if not exists idx_scraper_leads_city on public.scraper_leads (city);
create index if not exists idx_scraper_leads_status on public.scraper_leads (status);
create index if not exists idx_scraper_leads_score on public.scraper_leads (score desc);

create table if not exists public.scraper_outbound_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.scraper_leads(id) on delete cascade,
  instance text not null,
  phone text not null,
  message text,
  status text, -- sent | error | skipped
  error text,
  response_classification text, -- INTERESSADO | DUVIDA | OBJECAO | NAO | ...
  response_text text,
  sent_at timestamptz default now(),
  responded_at timestamptz
);

create index if not exists idx_outbound_lead on public.scraper_outbound_log (lead_id);
create index if not exists idx_outbound_status on public.scraper_outbound_log (status);

-- RLS: só service_role pode ler/escrever (scraper engine usa service key)
alter table public.scraper_leads enable row level security;
alter table public.scraper_outbound_log enable row level security;

-- Policy admin-only (via app, service_role bypassa)
create policy "admin_all" on public.scraper_leads
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy "admin_outbound" on public.scraper_outbound_log
  for all using (auth.jwt() ->> 'role' = 'admin');
