-- صقر · B3, the guarded door (2026-11-17): the ONLY way to write. One function per Admin action in the app
-- (assets/store.js → the same moves, same rules), plus the one read call (app_snapshot).
-- Every write function: (1) checks the caller is the Admin (42501 otherwise); (2) does the whole action as ONE
-- transaction — all of it or none of it; (3) runs B2's end-of-save rules INSIDE the call (private.done), so a refusal
-- comes back at once with its code; (4) returns only the new id(s): the app then reloads the snapshot (no merge code).
-- Refusal codes: 42501 Admin only · SK002 locked (a finished contract / a finished record) · SK003 wrong firm, kind or
-- missing · SK004 the money does not add up · SK005 a date rule · SK006 already reversed · SK007 already used.
-- Files: the browser picks the document id, uploads the file to the vault as docs/<id>.pdf (B4), then registers it
-- here through ONE helper (private.new_document) — B4 adds its "the uploaded file really exists" check there.

-- ══ helpers (private: not callable from the web) ═══════════════════════════════════════════════════════════════════
create table private.counters (name text primary key, value int not null check (value >= 0));
insert into private.counters (name, value) values ('voucher', 0);       -- gap-free voucher numbers 1, 2, 3…
comment on table private.counters is 'صقر: gap-free counters (locked in the same transaction as the paper they number)';

create or replace function private.require_admin() returns uuid
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'صقر: Admin only' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function private.done() returns void
  language plpgsql set search_path = '' as $$
begin
  set constraints all immediate;          -- B2's end-of-save rules run now, inside the call
end $$;

create or replace function private.round_box(p real[]) returns real[]
  language sql immutable set search_path = '' as $$
  select case when p is null then null
         else array(select round(x::numeric, 4)::real from unnest(p) with ordinality u(x, o) order by o) end $$;

create or replace function private.jbox(j jsonb) returns real[]
  language sql immutable set search_path = '' as $$
  select case when j is null or jsonb_typeof(j) <> 'array' then null
         else array(select x::real from jsonb_array_elements_text(j) with ordinality t(x, o) order by o) end $$;

-- a file the browser uploaded: {id, file_name, pages, sha256} (+ page, box when it carries the boxed amount)
create or replace function private.new_document(p_file jsonb, p_firm uuid, p_contract uuid, p_kind text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(nullif(p_file ->> 'id', '')::uuid, gen_random_uuid());
begin
  insert into public.documents (id, firm_id, contract_id, kind, file_path, file_name, pages, sha256, created_by)
  values (v_id, p_firm, p_contract, p_kind, 'docs/' || v_id || '.pdf', p_file ->> 'file_name',
          (p_file ->> 'pages')::int, lower(p_file ->> 'sha256'), auth.uid());
  return v_id;
end $$;

create or replace function private.new_anchor(p_doc uuid, p_page int, p_box real[]) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.anchors (document_id, page, box, created_by)
  values (p_doc, p_page, private.round_box(p_box), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- the contract, locked for this call; refused unless it is still a draft
create or replace function private.draft(p_cid uuid) returns public.contracts
  language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_cid for update;
  if not found then raise exception 'صقر: no such contract' using errcode = 'SK003'; end if;
  if c.state <> 'draft' then
    raise exception 'صقر: contract % is finished — its schedule is locked', c.ref using errcode = 'SK002';
  end if;
  return c;
end $$;

-- what a firm's credit holds now: live deposits − live uses
create or replace function private.credit_balance(p_firm uuid) returns bigint
  language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(p.amount_cents) from public.payments p
                    where p.firm_id = p_firm and p.kind = 'credit' and p.voided_at is null), 0)
       - coalesce((select sum(a.amount_cents) from public.allocations a join public.payments p on p.id = a.payment_id
                    where p.firm_id = p_firm and p.kind = 'credit' and a.voided_at is null), 0) $$;

-- ══ contracts: build a draft, then finish it ══════════════════════════════════════════════════════════════════════
create or replace function public.create_contract(p_firm_name text, p_ref text, p_signed_on date, p_file jsonb)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); v_firm uuid; v_doc uuid; v_c uuid;
begin
  if coalesce(btrim(p_firm_name), '') = '' or coalesce(btrim(p_ref), '') = '' then
    raise exception 'صقر: the firm and the contract number are required' using errcode = 'SK003';
  end if;
  select id into v_firm from public.firms where lower(btrim(name)) = lower(btrim(p_firm_name));
  if v_firm is null then
    insert into public.firms (name, created_by) values (btrim(p_firm_name), v_user) returning id into v_firm;
  end if;
  if exists (select 1 from public.contracts where lower(btrim(ref)) = lower(btrim(p_ref))) then
    raise exception 'صقر: contract number % is already used', btrim(p_ref) using errcode = 'SK007';
  end if;
  v_doc := private.new_document(p_file, v_firm, null, 'contract');
  insert into public.contracts (firm_id, ref, signed_on, document_id, created_by)
  values (v_firm, btrim(p_ref), p_signed_on, v_doc, v_user) returning id into v_c;
  update public.documents set contract_id = v_c where id = v_doc;
  perform private.done();
  return jsonb_build_object('firm_id', v_firm, 'contract_id', v_c, 'document_id', v_doc);
end $$;

create or replace function public.add_anchor(p_document_id uuid, p_page int, p_box real[])
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_admin();
  if not exists (select 1 from public.documents where id = p_document_id) then
    raise exception 'صقر: no such file' using errcode = 'SK003';
  end if;
  v_id := private.new_anchor(p_document_id, p_page, p_box);
  perform private.done();
  return v_id;
end $$;

create or replace function public.move_anchor(p_anchor_id uuid, p_page int, p_box real[])
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if exists (select 1 from public.contracts c where c.state = 'active' and (c.total_anchor_id = p_anchor_id or exists (
               select 1 from public.installments i where i.contract_id = c.id and p_anchor_id in (i.amount_anchor_id, i.date_anchor_id))))
     or exists (select 1 from public.payments p where p.voided_at is null and p_anchor_id in (p.proof_anchor_id, p.instruction_anchor_id)) then
    raise exception 'صقر: this box is part of a finished record' using errcode = 'SK002';
  end if;
  update public.anchors set page = p_page, box = private.round_box(p_box) where id = p_anchor_id;
  if not found then raise exception 'صقر: no such box' using errcode = 'SK003'; end if;
  perform private.done();
end $$;

create or replace function public.set_total(p_contract_id uuid, p_total_cents bigint, p_anchor_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin(); perform private.draft(p_contract_id);
  update public.contracts set total_cents = p_total_cents, total_source = 'contract', total_anchor_id = p_anchor_id
   where id = p_contract_id;
  perform private.done();
end $$;

create or replace function public.clear_total(p_contract_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin(); perform private.draft(p_contract_id);
  update public.contracts set total_cents = null, total_source = null, total_anchor_id = null where id = p_contract_id;
  perform private.done();
end $$;

create or replace function public.add_installment(p_contract_id uuid, p_due_on date, p_amount_cents bigint,
    p_amount_anchor_id uuid, p_date_anchor_id uuid, p_note text)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); v_id uuid;
begin
  perform private.draft(p_contract_id);
  insert into public.installments (contract_id, due_on, amount_cents, amount_anchor_id, date_anchor_id, created_by)
  values (p_contract_id, p_due_on, p_amount_cents, p_amount_anchor_id, p_date_anchor_id, v_user) returning id into v_id;
  if coalesce(btrim(p_note), '') <> '' then
    insert into public.notes (contract_id, installment_id, text, anchor_id, created_by)
    values (p_contract_id, v_id, btrim(p_note), coalesce(p_amount_anchor_id, p_date_anchor_id), v_user);
  end if;
  perform private.done();
  return v_id;
end $$;

-- {amount_anchor_id?, date_anchor_id?}: only the keys given change (null = not highlighted)
create or replace function public.set_installment_parts(p_installment_id uuid, p_parts jsonb)
  returns void language plpgsql security definer set search_path = '' as $$
declare i public.installments;
begin
  perform private.require_admin();
  select * into i from public.installments where id = p_installment_id;
  if not found then raise exception 'صقر: no such installment' using errcode = 'SK003'; end if;
  perform private.draft(i.contract_id);
  update public.installments set
    amount_anchor_id = case when p_parts ? 'amount_anchor_id' then nullif(p_parts ->> 'amount_anchor_id', '')::uuid else amount_anchor_id end,
    date_anchor_id   = case when p_parts ? 'date_anchor_id'   then nullif(p_parts ->> 'date_anchor_id', '')::uuid   else date_anchor_id end
  where id = p_installment_id;
  perform private.done();
end $$;

-- the full edit (draft): date, amount and the installment's own note (a note sourced from an outside file stays)
create or replace function public.edit_installment(p_installment_id uuid, p_due_on date, p_amount_cents bigint, p_note text)
  returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); i public.installments; c public.contracts; n public.notes;
begin
  select * into i from public.installments where id = p_installment_id and voided_at is null;
  if not found then raise exception 'صقر: no such installment' using errcode = 'SK003'; end if;
  c := private.draft(i.contract_id);
  update public.installments set due_on = p_due_on, amount_cents = p_amount_cents
   where id = i.id and (due_on is distinct from p_due_on or amount_cents is distinct from p_amount_cents);
  select x.* into n from public.notes x left join public.anchors a on a.id = x.anchor_id
   where x.installment_id = i.id and x.voided_at is null and (x.anchor_id is null or a.document_id = c.document_id)
   order by x.created_at limit 1;
  if n.id is not null and coalesce(btrim(p_note), '') <> '' and n.text <> btrim(p_note) then
    update public.notes set text = btrim(p_note) where id = n.id;
  elsif n.id is not null and coalesce(btrim(p_note), '') = '' then
    update public.notes set voided_at = now() where id = n.id;
  elsif n.id is null and coalesce(btrim(p_note), '') <> '' then
    insert into public.notes (contract_id, installment_id, text, anchor_id, created_by)
    values (i.contract_id, i.id, btrim(p_note), coalesce(i.amount_anchor_id, i.date_anchor_id), v_user);
  end if;
  perform private.done();
end $$;

-- the values alone (e.g. a reference that moves a date) — the guard still keeps Σ installments = total
create or replace function public.edit_installment_values(p_installment_id uuid, p_due_on date, p_amount_cents bigint)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.installments set due_on = coalesce(p_due_on, due_on), amount_cents = coalesce(p_amount_cents, amount_cents)
   where id = p_installment_id and voided_at is null;
  if not found then raise exception 'صقر: no such installment' using errcode = 'SK003'; end if;
  perform private.done();
end $$;

create or replace function public.remove_installment(p_installment_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
declare i public.installments;
begin
  perform private.require_admin();
  select * into i from public.installments where id = p_installment_id and voided_at is null;
  if not found then raise exception 'صقر: no such installment' using errcode = 'SK003'; end if;
  perform private.draft(i.contract_id);
  update public.notes set voided_at = now() where installment_id = i.id and voided_at is null;
  update public.installments set voided_at = now() where id = i.id;
  perform private.done();
end $$;

create or replace function public.finish_contract(p_contract_id uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_n int; v_sum bigint; v_state text;
begin
  perform private.require_admin();
  c := private.draft(p_contract_id);
  select count(*), coalesce(sum(amount_cents), 0) into v_n, v_sum
    from public.installments where contract_id = c.id and voided_at is null;
  if v_n = 0 then raise exception 'صقر: add at least one installment' using errcode = 'SK004'; end if;
  if c.total_cents is null then            -- the contract states no total (the Admin confirmed): total = the sum
    update public.contracts set total_cents = v_sum, total_source = 'sum', state = 'active', activated_at = now() where id = c.id;
    v_state := 'no-total';
  elsif v_sum <> c.total_cents then
    raise exception 'صقر: installments % ≠ total %', v_sum, c.total_cents using errcode = 'SK004';
  else
    update public.contracts set state = 'active', activated_at = now() where id = c.id;
    v_state := 'match';
  end if;
  perform private.done();
  return jsonb_build_object('state', v_state, 'sum_cents', v_sum);
end $$;

-- ══ references and notes ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.add_reference(p_contract_id uuid, p_file jsonb)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_id uuid;
begin
  perform private.require_admin();
  select * into c from public.contracts where id = p_contract_id;
  if not found then raise exception 'صقر: no such contract' using errcode = 'SK003'; end if;
  v_id := private.new_document(p_file, c.firm_id, c.id, 'outside');
  perform private.done();
  return v_id;
end $$;

create or replace function public.add_link(p_contract_id uuid, p_document_id uuid, p_anchor_id uuid, p_target text, p_installment_id uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); v_id uuid;
begin
  insert into public.links (contract_id, document_id, anchor_id, target, installment_id, created_by)
  values (p_contract_id, p_document_id, p_anchor_id, p_target, p_installment_id, v_user) returning id into v_id;
  perform private.done();
  return v_id;
end $$;

create or replace function public.remove_link(p_link_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.links set voided_at = now() where id = p_link_id and voided_at is null;
  if not found then raise exception 'صقر: no such reference' using errcode = 'SK003'; end if;
  perform private.done();
end $$;

create or replace function public.add_note(p_contract_id uuid, p_installment_id uuid, p_text text, p_anchor_id uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); v_id uuid;
begin
  insert into public.notes (contract_id, installment_id, text, anchor_id, created_by)
  values (p_contract_id, p_installment_id, btrim(p_text), p_anchor_id, v_user) returning id into v_id;
  perform private.done();
  return v_id;
end $$;

create or replace function public.edit_note(p_note_id uuid, p_text text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.notes set text = btrim(p_text) where id = p_note_id and voided_at is null and text <> btrim(p_text);
  perform private.done();
end $$;

create or replace function public.remove_note(p_note_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.notes set voided_at = now() where id = p_note_id and voided_at is null;
  if not found then raise exception 'صقر: no such note' using errcode = 'SK003'; end if;
  perform private.done();
end $$;

-- ══ payments: one transfer = one record = one receipt with its amount boxed; split oldest first (chosen in the app) ═
-- p_receipt = {id, file_name, pages, sha256, page, box} · p_split = [{installment_id, cents}, …]
create or replace function public.record_payment(p_contract_id uuid, p_received_on date, p_amount_cents bigint,
    p_bank_ref text, p_receipt jsonb, p_split jsonb)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); c public.contracts; v_doc uuid; v_a uuid; v_p uuid; v_n int;
begin
  select * into c from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'صقر: no such contract' using errcode = 'SK003'; end if;
  if c.state <> 'active' then raise exception 'صقر: payments are for finished contracts only' using errcode = 'SK003'; end if;
  if exists (select 1 from public.payments where firm_id = c.firm_id and voided_at is null
             and lower(btrim(bank_ref)) = lower(btrim(p_bank_ref))) then
    raise exception 'صقر: bank reference % is already recorded for this firm', btrim(p_bank_ref) using errcode = 'SK007';
  end if;
  v_doc := private.new_document(p_receipt, c.firm_id, c.id, 'receipt');
  v_a := private.new_anchor(v_doc, coalesce((p_receipt ->> 'page')::int, 1), private.jbox(p_receipt -> 'box'));
  insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by)
  values ('transfer', c.firm_id, c.id, p_received_on, p_amount_cents, btrim(p_bank_ref), v_doc, v_a, v_user) returning id into v_p;
  insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by)
  select v_p, (e ->> 'installment_id')::uuid, (e ->> 'cents')::bigint, p_received_on, v_user
    from jsonb_array_elements(coalesce(p_split, '[]'::jsonb)) e where (e ->> 'cents')::bigint > 0;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'صقر: the split is empty' using errcode = 'SK004'; end if;
  perform private.done();
  return v_p;
end $$;

create or replace function public.reverse_payment(p_payment_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  perform private.require_admin();
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'صقر: no such payment' using errcode = 'SK003'; end if;
  if p.kind <> 'transfer' then raise exception 'صقر: a credit deposit is reversed with reverse_deposit' using errcode = 'SK003'; end if;
  if p.voided_at is not null then raise exception 'صقر: already reversed' using errcode = 'SK006'; end if;
  update public.allocations set voided_at = now() where payment_id = p.id and voided_at is null;
  update public.payments set voided_at = now() where id = p.id;
  perform private.done();
end $$;

-- ══ the firm's credit («رصيد تحت الحساب»): deposit · use (numbered settlement voucher) · reversal ════════════════
-- p_receipt / p_instruction = {id, file_name, pages, sha256, page, box}
create or replace function public.add_credit(p_firm_id uuid, p_received_on date, p_amount_cents bigint, p_bank_ref text,
    p_receipt jsonb, p_instruction jsonb)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); v_rd uuid; v_ra uuid; v_id uuid; v_ia uuid; v_p uuid;
begin
  if not exists (select 1 from public.firms where id = p_firm_id) then
    raise exception 'صقر: no such firm' using errcode = 'SK003';
  end if;
  if exists (select 1 from public.payments where firm_id = p_firm_id and voided_at is null
             and lower(btrim(bank_ref)) = lower(btrim(p_bank_ref))) then
    raise exception 'صقر: bank reference % is already recorded for this firm', btrim(p_bank_ref) using errcode = 'SK007';
  end if;
  v_rd := private.new_document(p_receipt, p_firm_id, null, 'receipt');
  v_ra := private.new_anchor(v_rd, coalesce((p_receipt ->> 'page')::int, 1), private.jbox(p_receipt -> 'box'));
  v_id := private.new_document(p_instruction, p_firm_id, null, 'instruction');
  v_ia := private.new_anchor(v_id, coalesce((p_instruction ->> 'page')::int, 1), private.jbox(p_instruction -> 'box'));
  insert into public.payments (kind, firm_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id,
                               instruction_document_id, instruction_anchor_id, created_by)
  values ('credit', p_firm_id, p_received_on, p_amount_cents, btrim(p_bank_ref), v_rd, v_ra, v_id, v_ia, v_user) returning id into v_p;
  perform private.done();
  return v_p;
end $$;

-- a use: TODAY (Baghdad), drawn from the oldest deposit first; the system writes the numbered settlement voucher
create or replace function public.apply_credit(p_contract_id uuid, p_amount_cents bigint, p_split jsonb)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_admin(); v_today date := private.today();
  c public.contracts; v_before bigint; v_sum bigint; v_no int; v_v uuid;
  v_dep uuid[] := '{}'; v_left bigint[] := '{}'; v_lines jsonb := '[]'::jsonb;
  e record; k int; v_need bigint; v_take bigint;
begin
  select * into c from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'صقر: no such contract' using errcode = 'SK003'; end if;
  if c.state <> 'active' then raise exception 'صقر: credit pays finished contracts only' using errcode = 'SK003'; end if;
  perform 1 from public.firms where id = c.firm_id for update;          -- one credit move per firm at a time
  v_before := private.credit_balance(c.firm_id);
  select coalesce(sum((x ->> 'cents')::bigint), 0) into v_sum
    from jsonb_array_elements(coalesce(p_split, '[]'::jsonb)) x where (x ->> 'cents')::bigint > 0;
  if p_amount_cents is null or p_amount_cents <= 0 or v_sum <> p_amount_cents then
    raise exception 'صقر: the split % ≠ the amount %', v_sum, p_amount_cents using errcode = 'SK004';
  end if;
  if p_amount_cents > v_before then
    raise exception 'صقر: % is more than the credit holds (%)', p_amount_cents, v_before using errcode = 'SK004';
  end if;
  for e in select p.id, p.amount_cents - coalesce((select sum(a.amount_cents) from public.allocations a
                                                     where a.payment_id = p.id and a.voided_at is null), 0) as left_cents
             from public.payments p
            where p.firm_id = c.firm_id and p.kind = 'credit' and p.voided_at is null
            order by p.received_on, p.created_at loop
    if e.left_cents > 0 then v_dep := v_dep || e.id; v_left := v_left || e.left_cents; end if;
  end loop;
  for e in select (x ->> 'installment_id')::uuid as inst, (x ->> 'cents')::bigint as cents
             from jsonb_array_elements(p_split) with ordinality t(x, o) where (x ->> 'cents')::bigint > 0 order by o loop
    v_need := e.cents;
    for k in 1 .. coalesce(array_length(v_dep, 1), 0) loop
      exit when v_need = 0;
      v_take := least(v_left[k], v_need);
      if v_take > 0 then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('installment_id', e.inst, 'payment_id', v_dep[k], 'cents', v_take));
        v_left[k] := v_left[k] - v_take; v_need := v_need - v_take;
      end if;
    end loop;
    if v_need > 0 then raise exception 'صقر: the deposits do not cover the split' using errcode = 'SK004'; end if;
  end loop;
  update private.counters set value = value + 1 where name = 'voucher' returning value into v_no;
  insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines,
                               balance_before_cents, balance_after_cents, created_by)
  values (v_no, 'settlement', c.firm_id, c.id, v_today, p_amount_cents, v_lines, v_before, v_before - p_amount_cents, v_user)
  returning id into v_v;
  insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, voucher_id, created_by)
  select (l ->> 'payment_id')::uuid, (l ->> 'installment_id')::uuid, (l ->> 'cents')::bigint, v_today, v_v, v_user
    from jsonb_array_elements(v_lines) l;
  perform private.done();
  return jsonb_build_object('voucher_id', v_v, 'no', v_no);
end $$;

-- the money goes back to the credit; a numbered reversal voucher says so
create or replace function public.reverse_application(p_voucher_id uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_admin(); v public.vouchers; v_before bigint; v_no int; v_r uuid;
begin
  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found or v.kind <> 'settlement' or v.reversed_by is not null then
    raise exception 'صقر: nothing to reverse' using errcode = 'SK006';
  end if;
  perform 1 from public.firms where id = v.firm_id for update;
  v_before := private.credit_balance(v.firm_id);
  update public.allocations set voided_at = now() where voucher_id = v.id and voided_at is null;
  update private.counters set value = value + 1 where name = 'voucher' returning value into v_no;
  insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines,
                               balance_before_cents, balance_after_cents, reverses, created_by)
  values (v_no, 'reversal', v.firm_id, v.contract_id, private.today(), v.amount_cents, v.lines,
          v_before, v_before + v.amount_cents, v.id, v_user) returning id into v_r;
  update public.vouchers set reversed_by = v_r where id = v.id;
  perform private.done();
  return jsonb_build_object('voucher_id', v_r, 'no', v_no);
end $$;

-- a deposit is reversed only while none of it is used
create or replace function public.reverse_deposit(p_payment_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  perform private.require_admin();
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.kind <> 'credit' then raise exception 'صقر: no such deposit' using errcode = 'SK003'; end if;
  if p.voided_at is not null then raise exception 'صقر: already reversed' using errcode = 'SK006'; end if;
  if exists (select 1 from public.allocations where payment_id = p.id and voided_at is null) then
    raise exception 'صقر: this deposit is in use — reverse its settlement vouchers first' using errcode = 'SK004';
  end if;
  update public.payments set voided_at = now() where id = p.id;
  perform private.done();
end $$;

-- ══ reading ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- the ONE read call: everything this person may see (RLS decides — this function runs AS the caller), in the shape
-- the app already uses (data/demo.js), plus the two computed fields: installments.seq and installments.anchor_id.
-- Voided rows are included (the credit ledger shows reversed deposits); the app hides them where it always did.
create or replace function public.app_snapshot()
  returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'me',           (select jsonb_build_object('email', u.email, 'role', u.role, 'lang', u.lang)
                       from public.app_users u where u.user_id = (select auth.uid())),
    'today',        private.today(),
    'firms',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.firms t), '[]'::jsonb),
    'documents',    coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.documents t), '[]'::jsonb),
    'anchors',      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.anchors t), '[]'::jsonb),
    'contracts',    coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.contracts t), '[]'::jsonb),
    'installments', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('anchor_id', coalesce(t.amount_anchor_id, t.date_anchor_id))
                                                order by t.contract_id, t.due_on, t.created_at)
                                from (select x.*, case when x.voided_at is null then row_number() over (
                                               partition by x.contract_id, (x.voided_at is null) order by x.due_on, x.created_at) end as seq
                                        from public.installments x) t), '[]'::jsonb),
    'notes',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.notes t), '[]'::jsonb),
    'links',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.links t), '[]'::jsonb),
    'payments',     coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.payments t), '[]'::jsonb),
    'allocations',  coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.allocations t), '[]'::jsonb),
    'vouchers',     coalesce((select jsonb_agg(to_jsonb(t) order by t.no) from public.vouchers t), '[]'::jsonb)
  ) $$;

-- the health audit, for the Admin (empty = healthy)
create or replace function public.health_audit()
  returns table (rule text, row_id uuid, detail text) language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select * from private.run_health_audit();
end $$;

-- ══ who may call what: signed-in people only (the Admin check is inside each write) — never anonymous ══════════════
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('create_contract','add_anchor','move_anchor','set_total','clear_total','add_installment',
                                'set_installment_parts','edit_installment','edit_installment_values','remove_installment',
                                'finish_contract','add_reference','add_link','remove_link','add_note','edit_note','remove_note',
                                'record_payment','reverse_payment','add_credit','apply_credit','reverse_application',
                                'reverse_deposit','app_snapshot','health_audit') loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function private.require_admin(), private.done(), private.round_box(real[]), private.jbox(jsonb),
  private.new_document(jsonb, uuid, uuid, text), private.new_anchor(uuid, int, real[]), private.draft(uuid),
  private.credit_balance(uuid) from public, anon, authenticated;
