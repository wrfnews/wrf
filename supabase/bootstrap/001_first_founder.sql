-- Run only in the Supabase SQL Editor as project owner, after the intended Founder has signed up.
-- Replace the email below with the exact email used for that Supabase Auth account.
-- This file does not expose a public RPC and must never be run from browser code.
begin;

do $$
declare
  founder_email text := lower(trim('REPLACE_WITH_EXACT_FOUNDER_EMAIL'));
  founder_user_id uuid;
  existing_role text;
begin
  if founder_email = '' or founder_email = 'replace_with_exact_founder_email' then
    raise exception 'Set founder_email to the exact email of the intended Founder account before running this script';
  end if;

  select id into founder_user_id
  from auth.users
  where lower(email) = founder_email;

  if founder_user_id is null then
    raise exception 'No Supabase Auth user found for the specified email. Sign up that account first, then rerun.';
  end if;

  select role into existing_role
  from public.wrf_user_roles
  where user_id = founder_user_id;

  if existing_role is not null then
    raise exception 'This account already has WRF role %. No changes were made.', existing_role;
  end if;

  insert into public.wrf_user_roles (user_id, role, created_by)
  values (founder_user_id, 'founder', founder_user_id);

  insert into public.wrf_audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    founder_user_id,
    'founder.bootstrap_completed',
    'user',
    founder_user_id,
    jsonb_build_object('method', 'manual_supabase_sql_editor', 'email', founder_email)
  );
end
$$;

commit;
