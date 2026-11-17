-- صقر · people tools (2026-11-18): two named tools the project owner runs in Supabase → SQL Editor, because the
-- dashboard has no "change email" and roles live in our own table. Both sit in `private` (never callable from the web),
-- check their input, and every change lands in audit_log through the usual triggers.
--   select private.set_role('someone@example.com', 'boss');                 -- admin · boss · none (none = no access)
--   select private.change_email('old@example.com', 'new@example.com');      -- the account keeps its password and phone
-- (Removing a lost phone: Authentication → Users → the person → scroll the panel down → Danger zone → Remove MFA factors.)

create or replace function private.set_role(p_email text, p_role text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_old text;
begin
  if p_role not in ('admin', 'boss', 'none') then
    raise exception 'صقر: the role must be admin, boss or none (not %)', p_role using errcode = 'SK003';
  end if;
  select user_id, role into v_id, v_old from public.app_users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'صقر: no account with the email % (create it first in Authentication → Users)', p_email using errcode = 'SK003';
  end if;
  update public.app_users set role = p_role where user_id = v_id;
  return format('%s: %s → %s', btrim(p_email), v_old, p_role);
end $$;

create or replace function private.change_email(p_old text, p_new text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_new text := lower(btrim(p_new));
begin
  if v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'صقر: % is not an email address', p_new using errcode = 'SK003';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_old));
  if v_id is null then raise exception 'صقر: no account with the email %', p_old using errcode = 'SK003'; end if;
  if exists (select 1 from auth.users where lower(email) = v_new and id <> v_id) then
    raise exception 'صقر: % is already used by another account', v_new using errcode = 'SK007';
  end if;
  update auth.users set email = v_new, updated_at = now() where id = v_id;            -- the roles table follows (trigger)
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_new), updated_at = now()
   where user_id = v_id and provider = 'email';
  return format('%s → %s (same account, same password, same phone)', btrim(p_old), v_new);
end $$;

revoke all on function private.set_role(text, text), private.change_email(text, text) from public, anon, authenticated;
