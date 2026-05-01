-- Migration: Google Calendar integration fields
-- Run in Supabase SQL Editor

-- Add calendar config to agents table
alter table agents
  add column if not exists google_calendar_id text,
  add column if not exists google_service_account_json jsonb default null,
  add column if not exists working_hours_start text default '09:00',
  add column if not exists working_hours_end text default '18:00',
  add column if not exists slot_duration_minutes int default 60,
  add column if not exists working_days text[] default array['Mon','Tue','Wed','Thu','Fri'];

-- Add google_event_id to agendamentos so we can sync back
alter table agendamentos
  add column if not exists google_event_id text,
  add column if not exists google_event_link text;

-- Index for quick calendar lookups
 create index if not exists idx_agents_calendar on agents(tenant_id, google_calendar_id);
