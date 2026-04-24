-- BrainRam trial auto-cancel
alter table tenants
  add column if not exists trial_confirmed boolean not null default false,
  add column if not exists trial_prompt_sent_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists lead_phone text;

create index if not exists tenants_trial_watch_idx
  on tenants (status, trial_ends_at)
  where status = 'trial' and trial_confirmed = false;
