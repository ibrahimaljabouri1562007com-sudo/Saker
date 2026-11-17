-- صقر · B2 guard test (2026-11-17). NOT a migration: run by hand (or through the Supabase connector) after any
-- change to the guard. Fixtures (3 people, an active contract with a payment and a credit deposit, a draft at another
-- firm), then 51 cases — who sees what (run AS each person) and every rule tried the wrong way — then the health audit.
-- Everything is UNDONE at the end. Expected: every row pass = true, and "nothing left behind".
-- Codes: 42501 no right · SK001 nothing deleted · SK002 cannot change · SK003 wrong firm/kind/place ·
--        SK004 money does not add up · SK005 date rule · SK006 cannot go back · #n = rows seen · accepted = allowed.
-- First run 2026-11-17: 52/52 pass, 0 rows left. (Allowed cases build on each other: keep their order.)
-- since B5 the database holds data (the demo + test contracts) until B8: the test counts ONLY its own rows and checks
-- 'nothing left behind' against a snapshot of the totals taken before it runs
drop table if exists qa_base;
create temp table qa_base as select (select count(*) from public.firms) as firms, (select count(*) from public.audit_log) as log,
  (select count(*) from storage.objects where bucket_id = 'documents') as files, (select value from private.counters where name = 'voucher') as counter;
create temp table if not exists b2_results (n int, test text, expected text, got text, pass boolean);
truncate b2_results;
do $do$
declare
  ua uuid := '00000000-0000-0000-0000-0000000000a1';   -- the Admin
  ub uuid := '00000000-0000-0000-0000-0000000000b1';   -- the Boss
  us uuid := '00000000-0000-0000-0000-0000000000c1';   -- signed in, but not a صقر user
  f uuid; g uuid; df uuid; af uuid; ai1 uuid; ai2 uuid; c1 uuid; i1 uuid; i2 uuid;
  dr uuid; ar uuid; dr2 uuid; ar2 uuid; di uuid; ain uuid; p1 uuid; p2 uuid; dg uuid; d uuid; g1 uuid; dout uuid; aout uuid;
  cases text[][]; res text[] := '{}'; k int; s text; got text; cnt bigint; who text; exp text; ok boolean;
begin
  begin
    -- ── fixtures ──
    insert into auth.users (id, email) values (ua, 'qa-admin@demo.saker'), (ub, 'qa-boss@demo.saker'), (us, 'qa-stranger@demo.saker');
    -- since b5_people every new account gets its app_users row by itself (role none): the test sets the roles
    update public.app_users set role = 'admin' where user_id = ua; update public.app_users set role = 'boss' where user_id = ub;
    insert into public.firms (name, created_by) values ('Contoso', ua) returning id into f;
    insert into public.firms (name, created_by) values ('Fabrikam', ua) returning id into g;
    insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (f, 'contract', 't/f-c.pdf', 'c.pdf', 2, repeat('a', 64), ua) returning id into df;
    insert into public.anchors (document_id, page, box, created_by) values (df, 2, '{0.1,0.10,0.5,0.03}', ua) returning id into af;
    insert into public.anchors (document_id, page, box, created_by) values (df, 2, '{0.1,0.20,0.5,0.03}', ua) returning id into ai1;
    insert into public.anchors (document_id, page, box, created_by) values (df, 2, '{0.1,0.25,0.5,0.03}', ua) returning id into ai2;
    insert into public.contracts (firm_id, ref, signed_on, document_id, total_cents, total_source, total_anchor_id, created_by)
      values (f, 'CTR-1', '2026-08-01', df, 6000000, 'contract', af, ua) returning id into c1;
    update public.documents set contract_id = c1 where id = df;
    insert into public.installments (contract_id, due_on, amount_cents, amount_anchor_id, date_anchor_id, created_by) values (c1, '2026-09-10', 3000000, ai1, ai1, ua) returning id into i1;
    insert into public.installments (contract_id, due_on, amount_cents, amount_anchor_id, date_anchor_id, created_by) values (c1, '2026-10-10', 3000000, ai2, ai2, ua) returning id into i2;
    update public.contracts set state = 'active', activated_at = now() where id = c1;
    insert into public.documents (firm_id, contract_id, kind, file_path, file_name, pages, sha256, created_by) values (f, c1, 'receipt', 't/f-r1.pdf', 'r1.pdf', 1, repeat('b', 64), ua) returning id into dr;
    insert into public.anchors (document_id, page, box, created_by) values (dr, 1, '{0.2,0.3,0.4,0.05}', ua) returning id into ar;
    insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by)
      values ('transfer', f, c1, '2026-09-10', 3000000, 'TRX-1', dr, ar, ua) returning id into p1;
    insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by) values (p1, i1, 3000000, '2026-09-10', ua);
    insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (f, 'receipt', 't/f-r2.pdf', 'r2.pdf', 1, repeat('c', 64), ua) returning id into dr2;
    insert into public.anchors (document_id, page, box, created_by) values (dr2, 1, '{0.2,0.3,0.4,0.05}', ua) returning id into ar2;
    insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (f, 'instruction', 't/f-i.pdf', 'i.pdf', 1, repeat('d', 64), ua) returning id into di;
    insert into public.anchors (document_id, page, box, created_by) values (di, 1, null, ua) returning id into ain;
    insert into public.payments (kind, firm_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, instruction_document_id, instruction_anchor_id, created_by)
      values ('credit', f, '2026-10-01', 1000000, 'DEP-1', dr2, ar2, di, ain, ua) returning id into p2;
    insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (f, 'outside', 't/f-o.pdf', 'o.pdf', 1, repeat('e', 64), ua) returning id into dout;
    insert into public.anchors (document_id, page, box, created_by) values (dout, 1, '{0.1,0.1,0.3,0.05}', ua) returning id into aout;
    insert into public.documents (firm_id, kind, file_path, file_name, pages, sha256, created_by) values (g, 'contract', 't/g-c.pdf', 'g.pdf', 1, repeat('f', 64), ua) returning id into dg;
    insert into public.contracts (firm_id, ref, signed_on, document_id, created_by) values (g, 'FAB-1', '2026-09-01', dg, ua) returning id into d;
    update public.documents set contract_id = d where id = dg;
    insert into public.installments (contract_id, due_on, amount_cents, created_by) values (d, '2026-12-01', 500000, ua) returning id into g1;
    set constraints all immediate;
    set constraints all deferred;
    res := res || 'fixtures: active contract + payment + credit deposit + a draft at another firm|accepted|accepted|true'::text;

    cases := array[
      -- who sees what (made AS each person)
      array['Boss sees contracts: the active one only (draft hidden)', '#1', format('select count(*) from public.contracts where firm_id in (%L, %L)', f, g), 'boss'],
      array['Boss sees firms: only the one with an active contract', '#1', format('select count(*) from public.firms where id in (%L, %L)', f, g), 'boss'],
      array['Boss sees installments of active contracts only', '#2', format('select count(*) from public.installments where contract_id in (%L, %L)', c1, d), 'boss'],
      array['Boss sees the active firm''s 5 files, not the draft''s', '#5', format('select count(*) from public.documents where firm_id in (%L, %L)', f, g), 'boss'],
      array['Boss sees no history', '#0', 'select count(*) from public.audit_log', 'boss'],
      array['Boss sees only himself among users', '#1', 'select count(*) from public.app_users', 'boss'],
      array['Admin sees both contracts', '#2', format('select count(*) from public.contracts where firm_id in (%L, %L)', f, g), 'admin'],
      array['Admin sees the history', '#>0', 'select count(*) from public.audit_log', 'admin'],
      array['a signed-in stranger (no صقر role) sees nothing', '#0', 'select count(*) from public.contracts', 'stranger'],
      array['anonymous visitor cannot read at all', '42501', 'select count(*) from public.contracts', 'anon'],
      array['Boss cannot write a table', '42501', $q$insert into public.firms (name) values ('X')$q$, 'boss'],
      array['Admin cannot write a table directly either (only via functions, B3)', '42501', $q$insert into public.firms (name) values ('X')$q$, 'admin'],
      -- nothing deleted, nothing silently changed
      array['delete a firm', 'SK001', format('delete from public.firms where id = %L', g), ''],
      array['empty the history (truncate)', 'SK001', 'truncate public.audit_log', ''],
      array['delete a history line', 'SK001', 'delete from public.audit_log', ''],
      array['edit a history line', 'SK002', $q$update public.audit_log set action = 'update'$q$, ''],
      array['edit a payment''s amount', 'SK002', format('update public.payments set amount_cents = 1 where id = %L', p1), ''],
      array['edit a payment''s bank ref', 'SK002', format($q$update public.payments set bank_ref = 'X' where id = %L$q$, p1), ''],
      array['move a contract to another firm', 'SK002', format('update public.contracts set firm_id = %L where id = %L', g, c1), ''],
      array['active contract back to draft', 'SK006', format('update public.contracts set state = ''draft'', activated_at = null where id = %L', c1), ''],
      -- the money adds up
      array['reverse a payment but leave its split paying', 'SK004', format('update public.payments set voided_at = now() where id = %L', p1), ''],
      array['transfer whose split ≠ its amount', 'SK004', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-10-10', 1000000, 'TRX-3', %L, %L, %L) ;; insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by) select id, %L, 500000, '2026-10-10', %L from public.payments where bank_ref = 'TRX-3'$q$, f, c1, dr, ar, ua, i2, ua), ''],
      array['transfer with its exact split (allowed)', 'accepted', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-10-10', 1000000, 'TRX-3', %L, %L, %L) ;; insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by) select id, %L, 1000000, '2026-10-10', %L from public.payments where bank_ref = 'TRX-3'$q$, f, c1, dr, ar, ua, i2, ua), ''],
      array['pay an installment beyond its amount', 'SK004', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-10-11', 2500000, 'TRX-4', %L, %L, %L) ;; insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by) select id, %L, 2500000, '2026-10-11', %L from public.payments where bank_ref = 'TRX-4'$q$, f, c1, dr, ar, ua, i2, ua), ''],
      array['remove (void) an installment of an active contract', 'SK004', format('update public.installments set voided_at = now() where id = %L', i2), ''],
      array['change an installment so Σ ≠ total', 'SK004', format('update public.installments set amount_cents = 2000000 where id = %L', i2), ''],
      array['activate a draft that has no total', 'SK004', format('update public.contracts set state = ''active'', activated_at = now() where id = %L', d), ''],
      array['activate a draft whose total ≠ its installments', 'SK004', format($q$update public.contracts set total_cents = 900000, total_source = 'sum', state = 'active', activated_at = now() where id = %L$q$, d), ''],
      -- right firm, right kind, right place
      array['a transfer onto another contract''s installment', 'SK003', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-10-12', 500000, 'TRX-5', %L, %L, %L) ;; insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by) select id, %L, 500000, '2026-10-12', %L from public.payments where bank_ref = 'TRX-5'$q$, f, c1, dr, ar, ua, g1, ua), ''],
      array['a payment for a draft contract', 'SK003', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-10-12', 500000, 'TRX-6', %L, %L, %L)$q$, g, d, dr, ar, ua), ''],
      array['a payment whose contract is another firm''s', 'SK003', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-10-12', 500000, 'TRX-7', %L, %L, %L)$q$, g, c1, dr, ar, ua), ''],
      array['a contract whose file is a receipt', 'SK003', format($q$insert into public.contracts (firm_id, ref, document_id, created_by) values (%L, 'CTR-9', %L, %L)$q$, f, dr, ua), ''],
      array['a contract whose file is another firm''s', 'SK003', format($q$insert into public.contracts (firm_id, ref, document_id, created_by) values (%L, 'FAB-9', %L, %L)$q$, g, df, ua), ''],
      array['a highlight on page 5 of a 2-page file', 'SK003', format('insert into public.anchors (document_id, page, created_by) values (%L, 5, %L)', df, ua), ''],
      array['an installment box on another file', 'SK003', format($q$insert into public.installments (contract_id, due_on, amount_cents, amount_anchor_id, created_by) values (%L, '2026-12-15', 100, %L, %L)$q$, d, ar, ua), ''],
      array['a reference from another firm''s file', 'SK003', format($q$insert into public.links (contract_id, document_id, anchor_id, target, created_by) values (%L, %L, %L, 'contract', %L)$q$, d, dout, aout, ua), ''],
      array['a reference from the same firm''s outside file (allowed)', 'accepted', format($q$insert into public.links (contract_id, document_id, anchor_id, target, created_by) values (%L, %L, %L, 'contract', %L)$q$, c1, dout, aout, ua), ''],
      -- the date laws (today = Baghdad)
      array['money received in the future', 'SK005', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2027-01-01', 100, 'TRX-8', %L, %L, %L)$q$, f, c1, dr, ar, ua), ''],
      array['money received before the signing', 'SK005', format($q$insert into public.payments (kind, firm_id, contract_id, received_on, amount_cents, bank_ref, proof_document_id, proof_anchor_id, created_by) values ('transfer', %L, %L, '2026-07-01', 100, 'TRX-9', %L, %L, %L)$q$, f, c1, dr, ar, ua), ''],
      array['an installment due before the signing', 'SK005', format($q$insert into public.installments (contract_id, due_on, amount_cents, created_by) values (%L, '2026-08-01', 100, %L)$q$, d, ua), ''],
      array['a contract signed in the future', 'SK005', format($q$update public.contracts set signed_on = '2027-01-01' where id = %L$q$, d), ''],
      -- credit: uses need their voucher, never beyond the deposit
      array['credit used without its voucher', 'SK003', format($q$insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, created_by) values (%L, %L, 300000, private.today(), %L)$q$, p2, i2, ua), ''],
      array['credit used WITH its numbered voucher (allowed)', 'accepted', format($q$insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines, balance_before_cents, balance_after_cents, created_by) values (1, 'settlement', %L, %L, private.today(), 300000, '[{"cents":300000}]', 1000000, 700000, %L) ;; insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, voucher_id, created_by) select %L, %L, 300000, private.today(), id, %L from public.vouchers where no = 1$q$, f, c1, ua, p2, i2, ua), ''],
      array['credit used beyond the deposit', 'SK004', format($q$insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines, balance_before_cents, balance_after_cents, created_by) values (2, 'settlement', %L, %L, private.today(), 800000, '[{"cents":800000}]', 700000, 0, %L) ;; insert into public.allocations (payment_id, installment_id, amount_cents, applied_on, voucher_id, created_by) select %L, %L, 800000, private.today(), id, %L from public.vouchers where no = 2$q$, f, c1, ua, p2, i2, ua), ''],
      array['reverse the credit use with a reversal voucher (allowed)', 'accepted', format($q$update public.allocations set voided_at = now() where voucher_id = (select id from public.vouchers where no = 1) ;; insert into public.vouchers (no, kind, firm_id, contract_id, issued_on, amount_cents, lines, balance_before_cents, balance_after_cents, reverses, created_by) select 2, 'reversal', %L, %L, private.today(), 300000, lines, 700000, 1000000, id, %L from public.vouchers where no = 1 ;; update public.vouchers set reversed_by = (select id from public.vouchers where no = 2) where no = 1$q$, f, c1, ua), ''],
      array['re-point a voucher''s reversal', 'SK002', $q$update public.vouchers set reversed_by = (select id from public.vouchers where no = 1) where no = 1$q$, ''],
      -- reversal is final
      array['reverse a payment AND its split (allowed)', 'accepted', format('update public.allocations set voided_at = now() where payment_id = %L ;; update public.payments set voided_at = now() where id = %L', p1, p1), ''],
      array['un-reverse it', 'SK006', format('update public.payments set voided_at = null where id = %L', p1), ''],
      -- the history and the health audit
      array['history recorded every write (inserts)', '#>0', $q$select count(*) from public.audit_log where action = 'insert'$q$, ''],
      array['history recorded the reversals as "void"', '#>0', $q$select count(*) from public.audit_log where action = 'void'$q$, ''],
      array['health audit after all of this: no breaks', '#0', 'select count(*) from private.run_health_audit()', '']
    ];
    for k in 1 .. array_length(cases, 1) loop
      who := cases[k][4]; exp := cases[k][2]; cnt := null;
      begin
        if who = 'anon' then
          perform set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
        elsif who <> '' then
          perform set_config('request.jwt.claims', json_build_object('sub', case who when 'admin' then ua when 'boss' then ub else us end, 'role', 'authenticated', 'aal', 'aal2')::text, true);
          set local role authenticated;
        end if;
        set constraints all deferred;
        if exp like '#%' then
          execute cases[k][3] into cnt; got := '#' || cnt;
        else
          foreach s in array string_to_array(cases[k][3], ' ;; ') loop execute s; end loop;
          set constraints all immediate;
          got := 'accepted';
        end if;
        reset role; perform set_config('request.jwt.claims', '', true);
      exception when others then got := sqlstate;
      end;
      ok := case when exp = '#>0' then cnt > 0 else got = exp end;
      res := res || (cases[k][1] || '|' || exp || '|' || got || '|' || coalesce(ok, false)::text);
    end loop;
    raise exception 'undo everything' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  insert into b2_results select row_number() over (), split_part(x, '|', 1), split_part(x, '|', 2), split_part(x, '|', 3), split_part(x, '|', 4)::boolean from unnest(res) x;
end $do$;
select n, pass, expected, got, test from b2_results
union all select 99, (select count(*) from public.firms) = (select firms from qa_base) and (select count(*) from public.audit_log) = (select log from qa_base)
  and (select count(*) from storage.objects where bucket_id = 'documents') = (select files from qa_base)
  and (select value from private.counters where name = 'voucher') = (select counter from qa_base)
  and (select count(*) from auth.users where email like 'qa-%@demo.saker') = 0,
  'all undone', (select count(*) from public.firms) - (select firms from qa_base) || ' firms / ' || (select count(*) from public.audit_log) - (select log from qa_base)
  || ' log / ' || (select count(*) from storage.objects where bucket_id = 'documents') - (select files from qa_base) || ' files added', 'nothing left behind'
order by n;
