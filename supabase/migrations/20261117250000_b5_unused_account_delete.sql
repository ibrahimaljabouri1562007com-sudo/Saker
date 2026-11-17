-- صقر · B5 follow-up (2026-11-17): an account created by mistake can be deleted — but ONLY if it never did anything.
-- "Nothing is ever deleted" protects the records and who made them. An account that holds no access (role 'none') and
-- authored nothing — no row in any table, no line in the history signed by it — has nothing to protect, so deleting it
-- in Authentication → Users is allowed; its removal is written to the history. Anyone with a history can only be set to
-- 'none' (the delete is refused, and the whole account delete with it).

-- deleting the account in Authentication now carries its roles row along (the check below decides if that may happen)
alter table public.app_users drop constraint app_users_user_id_fkey;
alter table public.app_users add constraint app_users_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

create or replace function private.app_user_delete() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare u uuid := old.user_id;
begin
  if old.role <> 'none' then
    raise exception 'صقر: % still has the role % — set it to none first', old.email, old.role using errcode = 'SK001';
  end if;
  if exists (select 1 from public.firms where created_by = u) or exists (select 1 from public.documents where created_by = u)
     or exists (select 1 from public.anchors where created_by = u) or exists (select 1 from public.contracts where created_by = u)
     or exists (select 1 from public.installments where created_by = u) or exists (select 1 from public.notes where created_by = u)
     or exists (select 1 from public.links where created_by = u) or exists (select 1 from public.payments where created_by = u)
     or exists (select 1 from public.vouchers where created_by = u) or exists (select 1 from public.allocations where created_by = u)
     or exists (select 1 from public.app_users where created_by = u)
     or exists (select 1 from public.audit_log where user_id = u) then
    raise exception 'صقر: % has a history in صقر — it can only be set to none', old.email using errcode = 'SK001';
  end if;
  insert into public.audit_log (user_id, table_name, row_id, action, before, after)
  values (auth.uid(), 'app_users', u::text, 'void', to_jsonb(old), null);
  return old;
end $$;
revoke all on function private.app_user_delete() from public, anon, authenticated;

drop trigger a_no_delete on public.app_users;
create trigger a_no_delete before delete on public.app_users for each row execute function private.app_user_delete();
