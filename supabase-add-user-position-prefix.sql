-- Add optional position prefix badge for users (shown in member list)
alter table if exists public.users
  add column if not exists position_prefix varchar(40);

comment on column public.users.position_prefix is 'Optional user badge/prefix shown in member list (e.g., Team Leader, Business Dev Lead).';
