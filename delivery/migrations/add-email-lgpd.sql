-- Migração: Email outbound + LGPD compliance
-- Rodar no SQL Editor do Supabase

-- Leads: campos de email e opt-out
alter table leads add column if not exists email text;
alter table leads add column if not exists opted_out boolean default false;
alter table leads add column if not exists opted_out_at timestamptz;
alter table leads add column if not exists niche text;

-- Índices úteis
create index if not exists idx_leads_email on leads(email) where email is not null;
create index if not exists idx_leads_opted_out on leads(opted_out) where opted_out = true;
create index if not exists idx_leads_niche on leads(niche);

-- Logs de email enviado
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  email text not null,
  subject text not null,
  status text check (status in ('sent','failed','bounced','delivered','opened','clicked')) default 'sent',
  provider_id text,
  error text,
  created_at timestamptz default now()
);
create index if not exists idx_email_logs_lead on email_logs(lead_id);
create index if not exists idx_email_logs_created on email_logs(created_at);

-- Tracking de aberturas de email
create table if not exists email_opens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  ua text,
  ip text,
  created_at timestamptz default now()
);
create index if not exists idx_email_opens_lead on email_opens(lead_id);

-- Campaigns: adicionar canal email
alter table campaigns add column if not exists copy_email_id uuid references copy_templates(id) on delete set null;

-- Copy templates: canal pode ser whatsapp ou email
alter table copy_templates add column if not exists channel text check (channel in ('whatsapp','email')) default 'whatsapp';

-- Tenants: campos de LGPD
alter table tenants add column if not exists lgpd_consent boolean default false;
alter table tenants add column if not exists lgpd_consent_at timestamptz;
alter table tenants add column if not exists data_deletion_requested_at timestamptz;

-- Tabela de consentimento explícito (audit trail)
create table if not exists consent_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  channel text not null, -- 'email','whatsapp','site'
  action text not null, -- 'opt_in','opt_out','consent_given'
  ip text,
  ua text,
  created_at timestamptz default now()
);

-- Tabela de escalacoes (faltava no schema base)
create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  contact text,
  motivo text,
  prioridade text default 'normal',
  resolved boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_escalations_tenant on escalations(tenant_id, created_at);

-- RLS desligado (service_role only)
alter table email_logs disable row level security;
alter table email_opens disable row level security;
alter table consent_logs disable row level security;
alter table escalations disable row level security;
