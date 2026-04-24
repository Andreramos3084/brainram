-- DFY-IA migração: adicionar suporte Mercado Pago
-- COLE no SQL Editor do Supabase (projeto nlcmhqevxpdttuhamjsj)

-- 1. colunas MP no tenant
alter table tenants add column if not exists mp_preapproval_id text;
alter table tenants add column if not exists mp_payer_email text;
create index if not exists idx_tenants_preapproval on tenants(mp_preapproval_id);

-- 2. tabela subscriptions
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  mp_preapproval_id text unique,
  mp_plan_id text,
  plan text,
  status text,
  payer_email text,
  next_payment_date timestamptz,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_subs_preapproval on subscriptions(mp_preapproval_id);
alter table subscriptions disable row level security;

-- 3. tabela mp_events (log auditoria)
create table if not exists mp_events (
  id bigserial primary key,
  event_type text,
  resource_id text,
  payload jsonb,
  processed_at timestamptz default now()
);
alter table mp_events disable row level security;

-- 4. tabela leads (pipeline de prospecção → tenant)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  name text,
  source text,
  score int,
  city text,
  mensagem_cold text,
  sent_at timestamptz,
  replied_at timestamptz,
  converted_tenant_id uuid references tenants(id),
  raw jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_leads_phone on leads(phone);
create index if not exists idx_leads_score on leads(score desc);
alter table leads disable row level security;
