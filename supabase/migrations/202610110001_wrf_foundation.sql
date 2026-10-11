-- WRF foundation migration. Review in a development project before production.
begin;
create extension if not exists pgcrypto;

create table if not exists public.wrf_countries (
  id uuid primary key default gen_random_uuid(),
  iso3 text not null unique check (iso3 ~ '^[A-Z]{3}$'),
  name text not null check (length(trim(name)) > 0),
  capital text,
  continent text check (continent is null or continent in ('Africa','Asia','Europe','North America','South America','Oceania','Antarctica')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.wrf_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  source_url text not null check (source_url ~ '^https?://'),
  publisher text, license_name text, license_url text, access_date date,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.wrf_indicators (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-zA-Z0-9_.-]+$'),
  name text not null, description text, unit text, created_at timestamptz not null default now()
);
create table if not exists public.wrf_indicator_values (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.wrf_countries(id),
  indicator_id uuid not null references public.wrf_indicators(id),
  source_id uuid not null references public.wrf_sources(id),
  numeric_value numeric, text_value text,
  reference_year integer not null check (reference_year between 1800 and 2200),
  evidence_url text not null check (evidence_url ~ '^https?://'),
  methodology_note text,
  status text not null default 'pending' check (status in ('pending','in_review','published','rejected')),
  submitted_by uuid references auth.users(id), reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (numeric_value is not null or nullif(trim(text_value), '') is not null),
  unique (country_id, indicator_id, source_id, reference_year)
);
create table if not exists public.wrf_value_versions (
  id uuid primary key default gen_random_uuid(),
  value_id uuid not null references public.wrf_indicator_values(id),
  snapshot jsonb not null, changed_by uuid references auth.users(id), changed_at timestamptz not null default now()
);
create table if not exists public.wrf_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('founder','admin','reviewer','user')),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.wrf_audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id),
  action text not null, entity_type text not null, entity_id uuid,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.wrf_review_requests (
  id uuid primary key default gen_random_uuid(),
  value_id uuid not null references public.wrf_indicator_values(id),
  reviewer_id uuid references auth.users(id),
  decision text not null check (decision in ('approved','rejected','request_evidence')),
  note text, created_at timestamptz not null default now()
);
create index if not exists wrf_values_public_idx on public.wrf_indicator_values(status, country_id, indicator_id);
create index if not exists wrf_values_source_idx on public.wrf_indicator_values(source_id);
create index if not exists wrf_audit_created_idx on public.wrf_audit_log(created_at desc);
create index if not exists wrf_versions_value_idx on public.wrf_value_versions(value_id, changed_at desc);

create or replace function public.wrf_has_any_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wrf_user_roles r where r.user_id = (select auth.uid()) and r.role = any(allowed_roles));
$$;
revoke all on function public.wrf_has_any_role(text[]) from public;
grant execute on function public.wrf_has_any_role(text[]) to authenticated;

create or replace function public.wrf_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists wrf_countries_touch on public.wrf_countries;
create trigger wrf_countries_touch before update on public.wrf_countries for each row execute function public.wrf_touch_updated_at();
drop trigger if exists wrf_values_touch on public.wrf_indicator_values;
create trigger wrf_values_touch before update on public.wrf_indicator_values for each row execute function public.wrf_touch_updated_at();

create or replace function public.wrf_capture_value_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_snapshot jsonb;
begin
  if tg_op = 'DELETE' then v_id := old.id; v_snapshot := to_jsonb(old);
  else v_id := new.id; v_snapshot := to_jsonb(new); end if;
  insert into public.wrf_value_versions(value_id, snapshot, changed_by) values (v_id, v_snapshot, auth.uid());
  insert into public.wrf_audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), lower(tg_op), 'indicator_value', v_id,
    jsonb_build_object('status', v_snapshot->>'status', 'reference_year', v_snapshot->>'reference_year'));
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists wrf_value_history on public.wrf_indicator_values;
create trigger wrf_value_history after insert or update on public.wrf_indicator_values for each row execute function public.wrf_capture_value_change();

alter table public.wrf_countries enable row level security;
alter table public.wrf_sources enable row level security;
alter table public.wrf_indicators enable row level security;
alter table public.wrf_indicator_values enable row level security;
alter table public.wrf_value_versions enable row level security;
alter table public.wrf_user_roles enable row level security;
alter table public.wrf_audit_log enable row level security;
alter table public.wrf_review_requests enable row level security;

drop policy if exists wrf_countries_public_read on public.wrf_countries;
create policy wrf_countries_public_read on public.wrf_countries for select to anon, authenticated using (true);
drop policy if exists wrf_indicators_public_read on public.wrf_indicators;
create policy wrf_indicators_public_read on public.wrf_indicators for select to anon, authenticated using (true);
drop policy if exists wrf_sources_public_read on public.wrf_sources;
create policy wrf_sources_public_read on public.wrf_sources for select to anon, authenticated using (status = 'approved');
drop policy if exists wrf_values_published_read on public.wrf_indicator_values;
create policy wrf_values_published_read on public.wrf_indicator_values for select to anon, authenticated using (status = 'published');

drop policy if exists wrf_countries_staff_manage on public.wrf_countries;
create policy wrf_countries_staff_manage on public.wrf_countries for all to authenticated using (public.wrf_has_any_role(array['founder','admin'])) with check (public.wrf_has_any_role(array['founder','admin']));
drop policy if exists wrf_sources_staff_manage on public.wrf_sources;
create policy wrf_sources_staff_manage on public.wrf_sources for all to authenticated using (public.wrf_has_any_role(array['founder','admin'])) with check (public.wrf_has_any_role(array['founder','admin']));
drop policy if exists wrf_sources_reviewer_read on public.wrf_sources;
create policy wrf_sources_reviewer_read on public.wrf_sources for select to authenticated using (public.wrf_has_any_role(array['founder','admin','reviewer']));
drop policy if exists wrf_indicators_staff_manage on public.wrf_indicators;
create policy wrf_indicators_staff_manage on public.wrf_indicators for all to authenticated using (public.wrf_has_any_role(array['founder','admin'])) with check (public.wrf_has_any_role(array['founder','admin']));
drop policy if exists wrf_values_staff_read on public.wrf_indicator_values;
create policy wrf_values_staff_read on public.wrf_indicator_values for select to authenticated using (public.wrf_has_any_role(array['founder','admin','reviewer']));
drop policy if exists wrf_values_submit on public.wrf_indicator_values;
create policy wrf_values_submit on public.wrf_indicator_values for insert to authenticated with check (status = 'pending' and submitted_by = (select auth.uid()));
drop policy if exists wrf_values_reviewer_update on public.wrf_indicator_values;
drop policy if exists wrf_versions_staff_read on public.wrf_value_versions;
create policy wrf_versions_staff_read on public.wrf_value_versions for select to authenticated using (public.wrf_has_any_role(array['founder','admin','reviewer']));
drop policy if exists wrf_roles_self_or_staff_read on public.wrf_user_roles;
create policy wrf_roles_self_or_staff_read on public.wrf_user_roles for select to authenticated using (user_id = (select auth.uid()) or public.wrf_has_any_role(array['founder','admin']));
drop policy if exists wrf_audit_staff_read on public.wrf_audit_log;
create policy wrf_audit_staff_read on public.wrf_audit_log for select to authenticated using (public.wrf_has_any_role(array['founder','admin']));
drop policy if exists wrf_review_staff_read on public.wrf_review_requests;
create policy wrf_review_staff_read on public.wrf_review_requests for select to authenticated using (public.wrf_has_any_role(array['founder','admin','reviewer']));
drop policy if exists wrf_review_staff_insert on public.wrf_review_requests;

revoke all on public.wrf_user_roles from anon, authenticated;
grant select on public.wrf_user_roles to authenticated;
revoke all on public.wrf_audit_log from anon, authenticated;
grant select on public.wrf_audit_log to authenticated;
revoke all on public.wrf_value_versions from anon, authenticated;
grant select on public.wrf_value_versions to authenticated;
revoke all on public.wrf_review_requests from anon, authenticated;
grant select on public.wrf_review_requests to authenticated;
revoke insert, update, delete on public.wrf_countries, public.wrf_sources, public.wrf_indicators, public.wrf_indicator_values from anon;
grant select on public.wrf_countries, public.wrf_sources, public.wrf_indicators, public.wrf_indicator_values to anon, authenticated;
grant insert, update, delete on public.wrf_countries, public.wrf_sources, public.wrf_indicators to authenticated;
grant insert on public.wrf_indicator_values to authenticated;
revoke update, delete on public.wrf_indicator_values from authenticated;

create or replace function public.wrf_review_value(p_value_id uuid, p_decision text, p_note text default null)
returns public.wrf_indicator_values language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_value public.wrf_indicator_values;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.wrf_has_any_role(array['founder','admin','reviewer']) then raise exception 'Reviewer permission required' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected','request_evidence') then raise exception 'Invalid review decision' using errcode = '22023'; end if;
  select * into v_value from public.wrf_indicator_values where id = p_value_id for update;
  if not found then raise exception 'Value not found' using errcode = 'P0002'; end if;
  if v_value.status not in ('pending','in_review') then raise exception 'Only pending or in-review values can be reviewed' using errcode = '55000'; end if;
  if v_value.submitted_by = v_actor then raise exception 'Reviewers cannot review their own submission' using errcode = '42501'; end if;
  if p_decision = 'approved' and not exists (
    select 1 from public.wrf_sources s where s.id = v_value.source_id and s.status = 'approved' and s.source_url ~ '^https?://'
  ) then raise exception 'An approved source is required before publication' using errcode = '23514'; end if;
  if p_decision in ('rejected','request_evidence') and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'A review note is required for rejection or evidence request' using errcode = '22023';
  end if;
  update public.wrf_indicator_values set status = case p_decision when 'approved' then 'published' when 'rejected' then 'rejected' else 'in_review' end,
    reviewed_by = v_actor, reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_value_id returning * into v_value;
  insert into public.wrf_review_requests(value_id, reviewer_id, decision, note) values (p_value_id, v_actor, p_decision, nullif(trim(coalesce(p_note, '')), ''));
  insert into public.wrf_audit_log(actor_id, action, entity_type, entity_id, details)
  values (v_actor, 'value.reviewed', 'indicator_value', p_value_id, jsonb_build_object('decision', p_decision, 'status', v_value.status));
  return v_value;
end;
$$;
revoke all on function public.wrf_review_value(uuid, text, text) from public, anon;
grant execute on function public.wrf_review_value(uuid, text, text) to authenticated;
commit;
