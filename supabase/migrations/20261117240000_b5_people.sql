-- صقر · B5, the people (2026-11-17): roles managed from the Supabase dashboard, safely.
--   1. Every sign-in account gets its row in public.app_users by itself, with role 'none' (= no access) — so a new
--      account sees NOTHING until someone deliberately sets its role to 'admin' or 'boss' (Table Editor → app_users).
--   2. The email shown beside the role follows the account: change it in Authentication, app_users follows.
--   3. Access is taken away by setting the role back to 'none' (rows are never deleted — the history keeps who did what).
-- Where to manage: Authentication → Users (the accounts, emails, passwords) · Table Editor → app_users (the role).
-- Every role change is written to audit_log (before → after), like every other edit.

alter table public.app_users drop constraint app_users_role_check;
alter table public.app_users add constraint app_users_role_check check (role in ('admin', 'boss', 'none'));
alter table public.app_users alter column role set default 'none';
comment on column public.app_users.role is 'صقر: admin · boss · none (no access). Change it here to give or take access.';

create or replace function private.on_new_account() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.app_users (user_id, email, role) values (new.id, coalesce(new.email, ''), 'none')
  on conflict (user_id) do nothing;
  return new;
end $$;

create or replace function private.on_account_email() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.app_users set email = coalesce(new.email, '') where user_id = new.id and email is distinct from coalesce(new.email, '');
  return new;
end $$;

create trigger saker_new_account after insert on auth.users for each row execute function private.on_new_account();
create trigger saker_account_email after update of email on auth.users for each row execute function private.on_account_email();
revoke all on function private.on_new_account(), private.on_account_email() from public, anon, authenticated;

-- the accounts that already exist get their row too (no access until a role is set)
insert into public.app_users (user_id, email, role)
select u.id, coalesce(u.email, ''), 'none' from auth.users u
on conflict (user_id) do nothing;
