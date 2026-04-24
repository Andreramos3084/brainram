-- DFY-IA schema (nlcmhqevxpdttuhamjsj)
-- Rodar no SQL editor do Supabase

-- tenants = clínicas clientes
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  segmento text default 'odonto',
  plan text check (plan in ('starter','pro','premium')) default 'starter',
  status text check (status in ('lead','trial','active','past_due','cancelled')) default 'lead',
  trial_ends_at timestamptz,
  mp_preapproval_id text,
  mp_payer_email text,
  phone text,
  onboarding_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_tenants_status on tenants(status);
create index if not exists idx_tenants_preapproval on tenants(mp_preapproval_id);

-- agents = configuração IA por tenant
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  system_prompt text not null,
  model text default 'sonar',
  evolution_instance text not null,
  created_at timestamptz default now()
);
create index if not exists idx_agents_tenant on agents(tenant_id);

-- conversations = histórico de mensagens
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  contact text not null,
  role text check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz default now()
);
create index if not exists idx_conversations_lookup on conversations(tenant_id, contact, created_at);

-- agendamentos realizados pela IA
create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  contact text,
  nome_paciente text,
  servico text,
  data date,
  hora text,
  status text default 'agendado',
  created_at timestamptz default now()
);
create index if not exists idx_agendamentos_tenant on agendamentos(tenant_id, data);

-- subscriptions = cobranças MP
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

-- eventos mp (log auditoria)
create table if not exists mp_events (
  id bigserial primary key,
  event_type text,
  resource_id text,
  payload jsonb,
  processed_at timestamptz default now()
);

-- usage por tenant (relatório diário)
create table if not exists agent_usage (
  id bigserial primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  day date default current_date,
  messages_in int default 0,
  messages_out int default 0,
  tokens_in int default 0,
  tokens_out int default 0,
  agendamentos int default 0
);
create index if not exists idx_usage_tenant_day on agent_usage(tenant_id, day);

-- RLS: desligar por enquanto (service_role só)
alter table tenants disable row level security;
alter table agents disable row level security;
alter table conversations disable row level security;
alter table agendamentos disable row level security;
alter table subscriptions disable row level security;
alter table mp_events disable row level security;
alter table agent_usage disable row level security;
