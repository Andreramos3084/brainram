-- Multi-número Evolution — rotação automática do worker entre instâncias ativas

create table if not exists wa_instances (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,                    -- ex: Clickmont, BrainRam2
  api_url text not null,                        -- ex: https://evolution.dfy-ia.com.br
  api_key text not null,
  phone text,                                   -- ex: 551151280116 (info, não usado pra send)
  daily_cap int not null default 100,           -- teto diário por número (anti-ban)
  daily_sent int not null default 0,
  last_reset_at date not null default current_date,
  warmup_stage int not null default 1,          -- 1=novo (30/d), 2=meio (60/d), 3=maduro (100+/d)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed: o Clickmont atual
insert into wa_instances (name, api_url, api_key, phone, daily_cap, warmup_stage)
values ('Clickmont', 'PLACEHOLDER_URL', 'PLACEHOLDER_KEY', '551151280116', 150, 3)
on conflict (name) do nothing;
