-- صقر · B6 (2026-11-17): the DATABASE requires the second step. A session that passed only the password (aal1) is
-- treated as nobody: it reads nothing, saves nothing, opens no file. Only a session that also passed the 6-digit code
-- from the account's authenticator app (aal2) has its role. A stolen or reset password alone is useless.
-- ONE place: private.my_role() — every read rule, every save function and the vault ask it, so all of them follow.
-- (Kept in supabase/pending/ until Ibrahim has linked his phone; then moved to supabase/migrations/ to be applied —
--  switching it on first could lock the Admin out of the app.)
create or replace function private.my_role() returns text
  language sql stable security definer set search_path = '' as $$
  select u.role from public.app_users u
   where u.user_id = auth.uid() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;
