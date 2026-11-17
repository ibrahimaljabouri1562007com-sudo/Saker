-- صقر · B2, the guard (2026-11-17). Four parts:
--   1. who sees what (RLS): the Boss reads active contracts and what hangs from them; the Admin reads all; the browser
--      can write NO table directly (the only writers arrive in B3 as functions);
--   2. nothing deleted, nothing silently changed: no DELETE / TRUNCATE ever; each table names the columns that may
--      change; a void, a voucher's reversal link and a file's contract are set once; active never goes back to draft;
--   3. the rules that span tables (constraint triggers, checked at the end of each transaction): same firm, right kind,
--      the date laws against today (Baghdad), Σ installments = total, a transfer = its split, nothing over-paid;
--   4. the one history (audit_log, append-only) and the health audit.
-- Refusal codes the app can translate word for word:
--   SK001 nothing is ever deleted · SK002 this field cannot be changed · SK003 wrong firm / kind / place ·
--   SK004 the money does not add up · SK005 a date rule is broken · SK006 cannot go back (un-void, active → draft)

-- ══ helpers (in `private`: never exposed through the API) ══════════════════════════════════════════════════════════
create or replace function private.today() returns date
  language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Baghdad')::date $$;

create or replace function private.my_role() returns text
  language sql stable security definer set search_path = ''
  as $$ select u.role from public.app_users u where u.user_id = auth.uid() $$;
create or replace function private.is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$ select coalesce(private.my_role() = 'admin', false) $$;
create or replace function private.is_boss() returns boolean
  language sql stable security definer set search_path = '' as $$ select coalesce(private.my_role() = 'boss', false) $$;

-- what the Boss may see: active contracts, and only what hangs from them
create or replace function private.contract_visible(cid uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.is_boss() and exists (
    select 1 from public.contracts c where c.id = cid and c.state = 'active')) $$;
create or replace function private.firm_visible(fid uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.is_boss() and exists (
    select 1 from public.contracts c where c.firm_id = fid and c.state = 'active')) $$;
create or replace function private.installment_visible(iid uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.is_boss() and exists (
    select 1 from public.installments i join public.contracts c on c.id = i.contract_id
    where i.id = iid and c.state = 'active')) $$;
create or replace function private.document_visible(did uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.is_boss() and exists (
    select 1 from public.documents d where d.id = did and (
      case when d.contract_id is not null
        then exists (select 1 from public.contracts c where c.id = d.contract_id and c.state = 'active')
        else exists (select 1 from public.contracts c where c.firm_id = d.firm_id and c.state = 'active') end))) $$;

-- ══ 1. who sees what ═══════════════════════════════════════════════════════════════════════════════════════════════
grant usage on schema private to authenticated;          -- `private` is not an API schema: nothing here is callable from the web
grant execute on function private.today(), private.my_role(), private.is_admin(), private.is_boss(),
  private.contract_visible(uuid), private.firm_visible(uuid), private.installment_visible(uuid),
  private.document_visible(uuid) to authenticated;

grant select on public.app_users, public.firms, public.documents, public.anchors, public.contracts, public.installments,
  public.notes, public.links, public.payments, public.vouchers, public.allocations, public.audit_log to authenticated;

create policy read on public.app_users    for select to authenticated using (user_id = auth.uid() or private.is_admin());
create policy read on public.firms        for select to authenticated using (private.firm_visible(id));
create policy read on public.contracts    for select to authenticated using (private.contract_visible(id));
create policy read on public.documents    for select to authenticated using (private.document_visible(id));
create policy read on public.anchors      for select to authenticated using (private.document_visible(document_id));
create policy read on public.installments for select to authenticated using (private.contract_visible(contract_id));
create policy read on public.notes        for select to authenticated using (private.contract_visible(contract_id));
create policy read on public.links        for select to authenticated using (private.contract_visible(contract_id));
create policy read on public.vouchers     for select to authenticated using (private.contract_visible(contract_id));
create policy read on public.payments     for select to authenticated using (
  case when contract_id is not null then private.contract_visible(contract_id) else private.firm_visible(firm_id) end);
create policy read on public.allocations  for select to authenticated using (private.installment_visible(installment_id));
create policy read on public.audit_log    for select to authenticated using (private.is_admin());

-- ══ 2. nothing deleted, nothing silently changed ══════════════════════════════════════════════════════════════════
create or replace function private.no_delete() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'صقر: nothing is ever deleted (%)', tg_table_name using errcode = 'SK001';
end $$;

create or replace function private.guard_update() returns trigger
  language plpgsql set search_path = '' as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
  allowed text[];
begin
  allowed := case tg_table_name
    when 'app_users'    then array['email', 'role', 'lang']
    when 'firms'        then array['name', 'contact']
    when 'documents'    then array['contract_id']                     -- set once, when its contract is created
    when 'anchors'      then array['page', 'box']                     -- a box may be moved (logged)
    when 'contracts'    then array['ref', 'signed_on', 'total_cents', 'total_source', 'total_anchor_id', 'state', 'activated_at']
    when 'installments' then array['due_on', 'amount_cents', 'amount_anchor_id', 'date_anchor_id', 'voided_at']
    when 'notes'        then array['text', 'anchor_id', 'voided_at']
    when 'links'        then array['voided_at']
    when 'payments'     then array['voided_at']                       -- reversed, never edited
    when 'allocations'  then array['voided_at']
    when 'vouchers'     then array['reversed_by']                     -- a paper, never edited
    else array[]::text[] end;                                         -- audit_log: nothing, ever
  for k in select jsonb_object_keys(n) loop
    if (o -> k) is distinct from (n -> k) and not (k = any (allowed)) then
      raise exception 'صقر: %.% cannot be changed', tg_table_name, k using errcode = 'SK002';
    end if;
  end loop;
  if (o ->> 'voided_at') is not null and (o -> 'voided_at') is distinct from (n -> 'voided_at') then
    raise exception 'صقر: a voided % stays voided', tg_table_name using errcode = 'SK006';
  end if;
  if tg_table_name = 'vouchers' and (o ->> 'reversed_by') is not null and (o -> 'reversed_by') is distinct from (n -> 'reversed_by') then
    raise exception 'صقر: a voucher is reversed once' using errcode = 'SK002';
  end if;
  if tg_table_name = 'documents' and (o ->> 'contract_id') is not null and (o -> 'contract_id') is distinct from (n -> 'contract_id') then
    raise exception 'صقر: a file belongs to its contract for good' using errcode = 'SK002';
  end if;
  if tg_table_name = 'contracts' and o ->> 'state' = 'active' and n ->> 'state' = 'draft' then
    raise exception 'صقر: an active contract never goes back to draft' using errcode = 'SK006';
  end if;
  return new;
end $$;

-- ══ 4. the one history ═════════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.audit() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if tg_op = 'UPDATE' and o = n then return null; end if;           -- nothing really changed: nothing to log
  insert into public.audit_log (user_id, table_name, row_id, action, before, after)
  values (coalesce(auth.uid(), nullif(n ->> 'created_by', '')::uuid), tg_table_name, coalesce(n ->> 'id', n ->> 'user_id'),
          case when tg_op = 'INSERT' then 'insert'
               when (o ->> 'voided_at') is null and (n ->> 'voided_at') is not null then 'void'
               else 'update' end,
          o, n);
  return null;
end $$;

-- ══ 3. the rules that span tables ══════════════════════════════════════════════════════════════════════════════════
-- the schedule of an ACTIVE contract adds up to its total
create or replace function private.assert_schedule(cid uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare c public.contracts; s bigint;
begin
  select * into c from public.contracts where id = cid;
  if c.state <> 'active' then return; end if;
  if c.total_cents is null then
    raise exception 'صقر: an active contract needs its total' using errcode = 'SK004';
  end if;
  select coalesce(sum(amount_cents), 0) into s from public.installments where contract_id = cid and voided_at is null;
  if s <> c.total_cents then
    raise exception 'صقر: installments % ≠ total % (contract %)', s, c.total_cents, c.ref using errcode = 'SK004';
  end if;
end $$;

-- a payment's live split: a transfer = its amount exactly · a deposit's uses ≤ the deposit · a reversed one = nothing
create or replace function private.assert_payment(pid uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare p public.payments; s bigint;
begin
  select * into p from public.payments where id = pid;
  select coalesce(sum(amount_cents), 0) into s from public.allocations where payment_id = pid and voided_at is null;
  if p.voided_at is not null and s <> 0 then
    raise exception 'صقر: a reversed payment still pays % (reverse its split too)', s using errcode = 'SK004';
  elsif p.voided_at is null and p.kind = 'transfer' and s <> p.amount_cents then
    raise exception 'صقر: the split % ≠ the payment %', s, p.amount_cents using errcode = 'SK004';
  elsif p.kind = 'credit' and s > p.amount_cents then
    raise exception 'صقر: the deposit is used % > %', s, p.amount_cents using errcode = 'SK004';
  end if;
end $$;

-- an installment is never paid beyond its amount, and a removed one carries no money
create or replace function private.assert_installment(iid uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare i public.installments; s bigint;
begin
  select * into i from public.installments where id = iid;
  select coalesce(sum(amount_cents), 0) into s from public.allocations where installment_id = iid and voided_at is null;
  if s > i.amount_cents then
    raise exception 'صقر: installment paid % > its amount %', s, i.amount_cents using errcode = 'SK004';
  elsif i.voided_at is not null and s > 0 then
    raise exception 'صقر: an installment with money on it cannot be removed' using errcode = 'SK004';
  end if;
end $$;

create or replace function private.check_document() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.contract_id is not null and not exists (
      select 1 from public.contracts c where c.id = new.contract_id and c.firm_id = new.firm_id) then
    raise exception 'صقر: the file and its contract belong to different firms' using errcode = 'SK003';
  end if;
  return null;
end $$;

create or replace function private.check_anchor() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.page > (select d.pages from public.documents d where d.id = new.document_id) then
    raise exception 'صقر: page % is beyond the file', new.page using errcode = 'SK003';
  end if;
  return null;
end $$;

create or replace function private.check_contract() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.documents d where d.id = new.document_id and d.kind = 'contract' and d.firm_id = new.firm_id) then
    raise exception 'صقر: the contract file must be a contract of the same firm' using errcode = 'SK003';
  end if;
  if new.total_anchor_id is not null and not exists (
      select 1 from public.anchors a where a.id = new.total_anchor_id and a.document_id = new.document_id) then
    raise exception 'صقر: the total''s box must be on the contract file' using errcode = 'SK003';
  end if;
  if new.signed_on is not null and (tg_op = 'INSERT' or new.signed_on is distinct from old.signed_on)
     and new.signed_on > private.today() then
    raise exception 'صقر: signed on % is after today', new.signed_on using errcode = 'SK005';
  end if;
  perform private.assert_schedule(new.id);
  return null;
end $$;

create or replace function private.check_installment() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = new.contract_id;
  if exists (select 1 from public.anchors a where a.id in (new.amount_anchor_id, new.date_anchor_id) and a.document_id <> c.document_id) then
    raise exception 'صقر: an installment''s boxes must be on its contract file' using errcode = 'SK003';
  end if;
  if c.signed_on is not null and new.due_on < c.signed_on
     and (tg_op = 'INSERT' or new.due_on is distinct from old.due_on) then
    raise exception 'صقر: due on % is before the signing (%)', new.due_on, c.signed_on using errcode = 'SK005';
  end if;
  perform private.assert_schedule(new.contract_id);
  perform private.assert_installment(new.id);
  return null;
end $$;

create or replace function private.check_note() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.installment_id is not null and not exists (
      select 1 from public.installments i where i.id = new.installment_id and i.contract_id = new.contract_id) then
    raise exception 'صقر: the note''s installment is not on its contract' using errcode = 'SK003';
  end if;
  if new.anchor_id is not null and not exists (
      select 1 from public.anchors a join public.documents d on d.id = a.document_id join public.contracts c on c.firm_id = d.firm_id
      where a.id = new.anchor_id and c.id = new.contract_id) then
    raise exception 'صقر: the note''s source belongs to another firm' using errcode = 'SK003';
  end if;
  return null;
end $$;

create or replace function private.check_link() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.documents d join public.contracts c on c.firm_id = d.firm_id
                 where d.id = new.document_id and d.kind = 'outside' and c.id = new.contract_id) then
    raise exception 'صقر: a reference must be an outside file of the same firm' using errcode = 'SK003';
  end if;
  if not exists (select 1 from public.anchors a where a.id = new.anchor_id and a.document_id = new.document_id) then
    raise exception 'صقر: the reference''s box must be on its file' using errcode = 'SK003';
  end if;
  if new.installment_id is not null and not exists (
      select 1 from public.installments i where i.id = new.installment_id and i.contract_id = new.contract_id) then
    raise exception 'صقر: the reference''s installment is not on its contract' using errcode = 'SK003';
  end if;
  return null;
end $$;

create or replace function private.check_payment() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  if new.kind = 'transfer' then
    select * into c from public.contracts where id = new.contract_id;
    if c.firm_id <> new.firm_id then
      raise exception 'صقر: the payment and its contract belong to different firms' using errcode = 'SK003';
    end if;
    if tg_op = 'INSERT' and c.state <> 'active' then
      raise exception 'صقر: payments are for finished contracts only' using errcode = 'SK003';
    end if;
    if tg_op = 'INSERT' and c.signed_on is not null and new.received_on < c.signed_on then
      raise exception 'صقر: received on % is before the signing (%)', new.received_on, c.signed_on using errcode = 'SK005';
    end if;
  end if;
  if not exists (select 1 from public.documents d join public.anchors a on a.document_id = d.id
                 where d.id = new.proof_document_id and a.id = new.proof_anchor_id and d.kind = 'receipt' and d.firm_id = new.firm_id) then
    raise exception 'صقر: the proof must be a receipt of the same firm, with its box on it' using errcode = 'SK003';
  end if;
  if new.kind = 'credit' and not exists (
      select 1 from public.documents d join public.anchors a on a.document_id = d.id
      where d.id = new.instruction_document_id and a.id = new.instruction_anchor_id and d.kind = 'instruction' and d.firm_id = new.firm_id) then
    raise exception 'صقر: the instruction must be the firm''s instruction, with its box on it' using errcode = 'SK003';
  end if;
  if tg_op = 'INSERT' and new.received_on > private.today() then
    raise exception 'صقر: received on % is after today', new.received_on using errcode = 'SK005';
  end if;
  perform private.assert_payment(new.id);
  return null;
end $$;

create or replace function private.check_allocation() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare p public.payments; i public.installments; ic public.contracts;
begin
  select * into p from public.payments where id = new.payment_id;
  select * into i from public.installments where id = new.installment_id;
  select * into ic from public.contracts where id = i.contract_id;
  if p.kind = 'transfer' and (i.contract_id <> p.contract_id or new.voucher_id is not null) then
    raise exception 'صقر: a transfer pays installments of its own contract (no voucher)' using errcode = 'SK003';
  end if;
  if p.kind = 'credit' and (ic.firm_id <> p.firm_id or new.voucher_id is null or not exists (
      select 1 from public.vouchers v where v.id = new.voucher_id and v.firm_id = p.firm_id and v.contract_id = i.contract_id)) then
    raise exception 'صقر: a credit use pays its own firm''s installment, with its voucher' using errcode = 'SK003';
  end if;
  if tg_op = 'INSERT' then
    if i.voided_at is not null or p.voided_at is not null then
      raise exception 'صقر: nothing is paid to or from a removed / reversed row' using errcode = 'SK003';
    end if;
    if new.applied_on < p.received_on or new.applied_on > private.today() then
      raise exception 'صقر: applied on % must be between the receipt (%) and today', new.applied_on, p.received_on using errcode = 'SK005';
    end if;
  end if;
  perform private.assert_payment(new.payment_id);
  perform private.assert_installment(new.installment_id);
  return null;
end $$;

create or replace function private.check_voucher() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.contracts c where c.id = new.contract_id and c.firm_id = new.firm_id) then
    raise exception 'صقر: the voucher and its contract belong to different firms' using errcode = 'SK003';
  end if;
  if new.reverses is not null and not exists (
      select 1 from public.vouchers v where v.id = new.reverses and v.kind = 'settlement' and v.contract_id = new.contract_id) then
    raise exception 'صقر: a reversal reverses a settlement of the same contract' using errcode = 'SK003';
  end if;
  if new.reversed_by is not null and not exists (
      select 1 from public.vouchers v where v.id = new.reversed_by and v.kind = 'reversal' and v.reverses = new.id) then
    raise exception 'صقر: reversed_by must be the reversal that reverses it' using errcode = 'SK003';
  end if;
  return null;
end $$;

-- ══ wiring: every table gets the same base triggers; each table its own rule check (at the end of the transaction) ═
do $$
declare t text;
begin
  foreach t in array array['app_users','firms','documents','anchors','contracts','installments','notes','links',
                           'payments','vouchers','allocations','audit_log'] loop
    execute format('create trigger a_no_delete before delete on public.%I for each row execute function private.no_delete()', t);
    execute format('create trigger a_no_truncate before truncate on public.%I for each statement execute function private.no_delete()', t);
    execute format('create trigger b_guard_update before update on public.%I for each row execute function private.guard_update()', t);
    if t <> 'audit_log' then
      execute format('create trigger z_audit after insert or update on public.%I for each row execute function private.audit()', t);
    end if;
  end loop;
end $$;

create constraint trigger c_rules after insert or update on public.documents    deferrable initially deferred for each row execute function private.check_document();
create constraint trigger c_rules after insert or update on public.anchors      deferrable initially deferred for each row execute function private.check_anchor();
create constraint trigger c_rules after insert or update on public.contracts    deferrable initially deferred for each row execute function private.check_contract();
create constraint trigger c_rules after insert or update on public.installments deferrable initially deferred for each row execute function private.check_installment();
create constraint trigger c_rules after insert or update on public.notes        deferrable initially deferred for each row execute function private.check_note();
create constraint trigger c_rules after insert or update on public.links        deferrable initially deferred for each row execute function private.check_link();
create constraint trigger c_rules after insert or update on public.payments     deferrable initially deferred for each row execute function private.check_payment();
create constraint trigger c_rules after insert or update on public.allocations  deferrable initially deferred for each row execute function private.check_allocation();
create constraint trigger c_rules after insert or update on public.vouchers     deferrable initially deferred for each row execute function private.check_voucher();

-- ══ the health audit: re-checks every money rule over ALL rows; returns the breaks (empty = healthy) ══════════════
create or replace function private.run_health_audit()
  returns table (rule text, row_id uuid, detail text)
  language sql stable security definer set search_path = '' as $$
  select 'active contract: installments ≠ total', c.id, c.ref || ': ' || coalesce(s.sum, 0) || ' ≠ ' || coalesce(c.total_cents::text, 'no total')
    from public.contracts c
    left join (select contract_id, sum(amount_cents) as sum from public.installments where voided_at is null group by 1) s on s.contract_id = c.id
   where c.state = 'active' and (c.total_cents is null or coalesce(s.sum, 0) <> c.total_cents)
  union all
  select 'installment paid beyond its amount', i.id, a.paid || ' > ' || i.amount_cents
    from public.installments i
    join (select installment_id, sum(amount_cents) as paid from public.allocations where voided_at is null group by 1) a on a.installment_id = i.id
   where a.paid > i.amount_cents or (i.voided_at is not null and a.paid > 0)
  union all
  select 'payment split does not match', p.id, p.kind || ' ' || p.bank_ref || ': split ' || coalesce(a.s, 0) || ' / amount ' || p.amount_cents
    from public.payments p
    left join (select payment_id, sum(amount_cents) as s from public.allocations where voided_at is null group by 1) a on a.payment_id = p.id
   where (p.voided_at is not null and coalesce(a.s, 0) <> 0)
      or (p.voided_at is null and p.kind = 'transfer' and coalesce(a.s, 0) <> p.amount_cents)
      or (p.kind = 'credit' and coalesce(a.s, 0) > p.amount_cents)
  union all
  select 'allocation crosses contracts or firms', al.id, 'payment ' || p.bank_ref
    from public.allocations al join public.payments p on p.id = al.payment_id
    join public.installments i on i.id = al.installment_id join public.contracts c on c.id = i.contract_id
   where (p.kind = 'transfer' and i.contract_id <> p.contract_id) or c.firm_id <> p.firm_id
  union all
  select 'file and contract disagree', d.id, d.file_name
    from public.documents d join public.contracts c on c.id = d.contract_id
   where c.firm_id <> d.firm_id
  union all
  select 'contract file is not a contract', c.id, c.ref
    from public.contracts c join public.documents d on d.id = c.document_id
   where d.kind <> 'contract' or d.firm_id <> c.firm_id
$$;
revoke all on function private.run_health_audit() from public, anon, authenticated;
