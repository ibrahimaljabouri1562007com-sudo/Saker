-- صقر · B1 shape test (2026-11-17). NOT a migration: run it by hand (or through the Supabase connector) after any
-- change to the tables. It inserts one valid chain, tries 29 good/bad cases, records the SQLSTATE each one got,
-- then UNDOES EVERYTHING (the fixtures never stay). Expected: every row pass = true, and "nothing left behind".
-- Codes: 23502 required field missing · 23503 broken link · 23505 duplicate · 23514 check failed · accepted = allowed.
-- First run 2026-11-17: 30/30 pass, 0 rows left.
create temp table if not exists b1_results (n int, test text, expected text, got text, pass boolean);
truncate b1_results;
do $do$
declare
  u uuid := '00000000-0000-0000-0000-00000000a11c';
  f uuid; d uuid; a uuid; c uuid; i uuid; dr uuid; ar uuid; di uuid; ai uuid; p uuid;
  cases text[][]; res text[] := '{}'; k int; st text;
begin
  begin
    insert into public.firms (name, created_by) values ('Contoso', u) returning id into f;
    insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by)
      values (f, 'contract', 'firm/t/c.pdf', 'c.pdf', 2, repeat('a', 64), u) returning id into d;
    insert into public.anchors (document_id, page, box, created_by) values (d, 2, '{0.1,0.2,0.5,0.03}', u) returning id into a;
    insert into public.contracts (firm_id, ref, signed_on, document_id, total_cents, total_source, total_anchor_id, created_by)
      values (f, 'CTR-1', '2026-08-01', d, 6000000, 'contract', a, u) returning id into c;
    update public.documents set contract_id = c where id = d;
    insert into public.installments (contract_id, due_on, amount_cents, amount_anchor_id, date_anchor_id, created_by)
      values (c, '2026-09-10', 2000000, a, a, u) returning id into i;
    insert into public.documents (firm_id, contract_id, kind, file_path, file_name, pages, sha256, created_by)
      values (f, c, 'receipt', 'firm/t/r.pdf', 'r.pdf', 1, repeat('b', 64), u) returning id into dr;
    insert into public.anchors (document_id, page, box, created_by) values (dr, 1, '{0.2,0.3,0.4,0.05}', u) returning id into ar;
    insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by)
      values (f, 'instruction', 'firm/t/i.pdf', 'i.pdf', 1, repeat('c', 64), u) returning id into di;
    insert into public.anchors (document_id, page, box, created_by) values (di, 1, null, u) returning id into ai;
    insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by)
      values ('transfer', f, c, '2026-09-10', 2000000, 'TRX-1', dr, ar, u) returning id into p;
    insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by)
      values (p, i, 2000000, '2026-09-10', u);
    res := res || 'valid chain: firm, file, highlight, contract, installment, payment, allocation|accepted|accepted|true'::text;

    cases := array[
      array['firm with no signed-in user (created_by empty)', '23502', $q$insert into public.firms (name) values ('Fabrikam')$q$],
      array['duplicate firm name, different case and spaces', '23505', format($q$insert into public.firms (name, created_by) values ('  contoso ', %L)$q$, u)],
      array['file fingerprint not 64 hex characters', '23514', format($q$insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (%L, 'outside', 'x1', 'x', 1, 'abc', %L)$q$, f, u)],
      array['file with 0 pages', '23514', format($q$insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (%L, 'outside', 'x2', 'x', 0, repeat('d', 64), %L)$q$, f, u)],
      array['file kind not in the list', '23514', format($q$insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (%L, 'photo', 'x3', 'x', 1, repeat('d', 64), %L)$q$, f, u)],
      array['same file path twice', '23505', format($q$insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (%L, 'outside', 'firm/t/c.pdf', 'x', 1, repeat('d', 64), %L)$q$, f, u)],
      array['highlight box outside the page (1.5)', '23514', format($q$insert into public.anchors (document_id, page, box, created_by) values (%L, 1, '{0.1,0.1,1.5,0.1}', %L)$q$, d, u)],
      array['highlight box with 3 numbers', '23514', format($q$insert into public.anchors (document_id, page, box, created_by) values (%L, 1, '{0.1,0.1,0.5}', %L)$q$, d, u)],
      array['highlight on page 0', '23514', format($q$insert into public.anchors (document_id, page, created_by) values (%L, 0, %L)$q$, d, u)],
      array['contract total without its source', '23514', format($q$insert into public.contracts (firm_id, ref, document_id, total_cents, created_by) values (%L, 'CTR-2', %L, 100, %L)$q$, f, d, u)],
      array['total "from the contract" without its box', '23514', format($q$insert into public.contracts (firm_id, ref, document_id, total_cents, total_source, created_by) values (%L, 'CTR-3', %L, 100, 'contract', %L)$q$, f, d, u)],
      array['active contract without its activation moment', '23514', format($q$insert into public.contracts (firm_id, ref, document_id, state, created_by) values (%L, 'CTR-4', %L, 'active', %L)$q$, f, d, u)],
      array['duplicate contract ref, different case', '23505', format($q$insert into public.contracts (firm_id, ref, document_id, created_by) values (%L, ' ctr-1', %L, %L)$q$, f, d, u)],
      array['installment of negative money', '23514', format($q$insert into public.installments (contract_id, due_on, amount_cents, created_by) values (%L, '2026-10-10', -5, %L)$q$, c, u)],
      array['installment of zero', '23514', format($q$insert into public.installments (contract_id, due_on, amount_cents, created_by) values (%L, '2026-10-10', 0, %L)$q$, c, u)],
      array['installment of a contract that does not exist', '23503', format($q$insert into public.installments (contract_id, due_on, amount_cents, created_by) values (gen_random_uuid(), '2026-10-10', 100, %L)$q$, u)],
      array['reference on an amount without its installment', '23514', format($q$insert into public.links (contract_id, document_id, anchor_id, target, created_by) values (%L, %L, %L, 'amount', %L)$q$, c, d, a, u)],
      array['transfer without its contract', '23514', format($q$insert into public.payments (kind, firm_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, '2026-09-11', 100, 'TRX-2', %L, %L, %L)$q$, f, dr, ar, u)],
      array['credit deposit without the firm''s instruction', '23514', format($q$insert into public.payments (kind, firm_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('credit', %L, '2026-09-11', 100, 'TRX-3', %L, %L, %L)$q$, f, dr, ar, u)],
      array['same bank ref twice for one firm (any case)', '23505', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-09-11', 100, ' trx-1', %L, %L, %L)$q$, f, c, dr, ar, u)],
      array['reverse the first payment (void it)', 'accepted', format($q$update public.payments set voided_at = now() where id = %L$q$, p)],
      array['same bank ref again AFTER the first was reversed', 'accepted', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-09-11', 100, 'TRX-1', %L, %L, %L)$q$, f, c, dr, ar, u)],
      array['credit deposit WITH its instruction', 'accepted', format($q$insert into public.payments (kind, firm_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, instruction_document_id, instruction_anchor_id, created_by) values ('credit', %L, '2026-09-11', 5000, 'DEP-1', %L, %L, %L, %L, %L)$q$, f, dr, ar, di, ai, u)],
      array['reversal voucher that points to nothing', '23514', format($q$insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines, balance_before_cents, balance_after_cents, created_by) values (1, 'reversal', %L, %L, '2026-09-12', 100, '[{"x":1}]', 100, 0, %L)$q$, f, c, u)],
      array['voucher number 0', '23514', format($q$insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines, balance_before_cents, balance_after_cents, created_by) values (0, 'settlement', %L, %L, '2026-09-12', 100, '[{"x":1}]', 100, 0, %L)$q$, f, c, u)],
      array['voucher with no lines', '23514', format($q$insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines, balance_before_cents, balance_after_cents, created_by) values (1, 'settlement', %L, %L, '2026-09-12', 100, '[]', 100, 0, %L)$q$, f, c, u)],
      array['allocation of zero', '23514', format($q$insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by) values (%L, %L, 0, '2026-09-10', %L)$q$, p, i, u)],
      array['delete a firm that has a contract', '23503', format($q$delete from public.firms where id = %L$q$, f)],
      array['history line with an unknown action', '23514', $q$insert into public.audit_log (table_name, row_id, action) values ('firms', 'x', 'delete')$q$]
    ];
    for k in 1 .. array_length(cases, 1) loop
      begin
        execute cases[k][3];
        st := 'accepted';
      exception when others then st := sqlstate;
      end;
      res := res || (cases[k][1] || '|' || cases[k][2] || '|' || st || '|' || (st = cases[k][2])::text);
    end loop;
    raise exception 'undo everything' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  insert into b1_results select row_number() over (), split_part(x, '|', 1), split_part(x, '|', 2), split_part(x, '|', 3), split_part(x, '|', 4)::boolean from unnest(res) x;
end $do$;
select n, pass, expected, got, test from b1_results
union all select 99, (select count(*) = 0 from public.firms) and (select count(*) = 0 from public.payments) and (select count(*) = 0 from public.contracts),
  'all undone', (select count(*) from public.firms)::text || ' firms / ' || (select count(*) from public.payments)::text || ' payments left', 'nothing left behind'
order by n;
