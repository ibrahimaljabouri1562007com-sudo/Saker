-- صقر · B3 functions test (2026-11-17). NOT a migration: run by hand (or through the Supabase connector) after any
-- change to the write door. It walks the app's real flow THROUGH the functions as the Admin (draft → gate refuses →
-- fix → finish → locked → payment → credit use / reversal with gap-free vouchers → references, notes), then checks what
-- the Boss, a stranger and an anonymous visitor may call and read. Values from earlier steps are kept by name ({c1}…).
-- Everything is UNDONE at the end (incl. the voucher counter). Expected: every row pass = true, "nothing left behind".
-- First run 2026-11-17: 48/48 pass, 0 rows left, counter 0. Re-run after B4 (files uploaded first): see the plan.
-- since B4 a file must be uploaded before it is registered: the test "uploads" its fixture files first (a row in storage)
create or replace function pg_temp.qa_file(p_id uuid, p_name text, p_pages int, p_page int default null, p_box jsonb default null)
  returns jsonb language plpgsql security definer as $f$
begin
  insert into storage.objects (bucket_id, name) values ('documents', 'docs/' || p_id || '.pdf') on conflict do nothing;
  return jsonb_strip_nulls(jsonb_build_object('id', p_id, 'file_name', p_name, 'pages', p_pages, 'sha256', repeat('a', 64), 'page', p_page, 'box', p_box));
end $f$;
create temp table if not exists b3_results (n int, test text, expected text, got text, pass boolean);
truncate b3_results;
do $do$
declare
  ua uuid := '00000000-0000-0000-0000-0000000000a1'; ub uuid := '00000000-0000-0000-0000-0000000000b1'; us uuid := '00000000-0000-0000-0000-0000000000c1';
  fc text := 'pg_temp.qa_file(gen_random_uuid(), ''c.pdf'', 2)';
  fr text := 'pg_temp.qa_file(gen_random_uuid(), ''r.pdf'', 1, 1, jsonb_build_array(0.2, 0.3, 0.4, 0.05))';
  cases text[][]; v jsonb := '{}'; res text[] := '{}'; k int; q text; key text; val text; got text; who text; exp text; ok boolean;
begin
  begin
    insert into auth.users (id, email) values (ua, 'qa-admin@demo.saker'), (ub, 'qa-boss@demo.saker'), (us, 'qa-stranger@demo.saker');
    insert into public.app_users (user_id, email, role) values (ua, 'qa-admin@demo.saker', 'admin'), (ub, 'qa-boss@demo.saker', 'boss');
    cases := array[
      -- build a draft (Admin)
      array['create a contract (new firm, file registered)', 'accepted', 'select (public.create_contract(''Contoso'', ''CTR-1'', ''2026-08-01'', ' || fc || '))->>''contract_id''', 'admin', 'c1'],
      array['its firm', 'accepted', 'select firm_id::text from public.contracts where id = ''{c1}''', '', 'f1'],
      array['its file', 'accepted', 'select document_id::text from public.contracts where id = ''{c1}''', '', 'd1'],
      array['same contract number again (other case/spaces)', 'SK007', 'select (public.create_contract('' contoso '', '' ctr-1'', null, ' || fc || '))::text', 'admin', ''],
      array['box the total on the contract', 'accepted', 'select public.add_anchor(''{d1}'', 2, ''{0.1,0.10,0.5,0.03}'')::text', 'admin', 'at'],
      array['box installment 1', 'accepted', 'select public.add_anchor(''{d1}'', 2, ''{0.1,0.20,0.5,0.03}'')::text', 'admin', 'a1'],
      array['box installment 2', 'accepted', 'select public.add_anchor(''{d1}'', 2, ''{0.1,0.25,0.5,0.03}'')::text', 'admin', 'a2'],
      array['set the total (60,000)', 'accepted', 'select ''ok'' from public.set_total(''{c1}'', 6000000, ''{at}'')', 'admin', ''],
      array['add installment 1 (30,000) with a note', 'accepted', 'select public.add_installment(''{c1}'', ''2026-09-10'', 3000000, ''{a1}'', ''{a1}'', ''first'')::text', 'admin', 'i1'],
      array['add installment 2 (20,000 — wrong on purpose)', 'accepted', 'select public.add_installment(''{c1}'', ''2026-10-10'', 2000000, ''{a2}'', ''{a2}'', null)::text', 'admin', 'i2'],
      array['finish while 50,000 ≠ 60,000', 'SK004', 'select (public.finish_contract(''{c1}''))::text', 'admin', ''],
      array['fix installment 2 to 30,000 (+ a note)', 'accepted', 'select ''ok'' from public.edit_installment(''{i2}'', ''2026-10-10'', 3000000, ''second'')', 'admin', ''],
      array['finish: the gate matches', '=match', 'select (public.finish_contract(''{c1}''))->>''state''', 'admin', ''],
      array['finished: add an installment', 'SK002', 'select public.add_installment(''{c1}'', ''2026-11-10'', 100, null, null, null)::text', 'admin', ''],
      array['finished: change the total', 'SK002', 'select ''ok'' from public.set_total(''{c1}'', 1, ''{at}'')', 'admin', ''],
      array['finished: move the total''s box', 'SK002', 'select ''ok'' from public.move_anchor(''{at}'', 1, ''{0.1,0.1,0.1,0.1}'')', 'admin', ''],
      -- payments
      array['record a payment (30,000, receipt boxed, split on installment 1)', 'accepted', 'select public.record_payment(''{c1}'', ''2026-09-10'', 3000000, ''TRX-1'', ' || fr || ', jsonb_build_array(jsonb_build_object(''installment_id'', ''{i1}'', ''cents'', 3000000)))::text', 'admin', 'p1'],
      array['same bank ref again (other case)', 'SK007', 'select public.record_payment(''{c1}'', ''2026-09-11'', 100, '' trx-1'', ' || fr || ', jsonb_build_array(jsonb_build_object(''installment_id'', ''{i2}'', ''cents'', 100)))::text', 'admin', ''],
      array['a payment whose split ≠ its amount', 'SK004', 'select public.record_payment(''{c1}'', ''2026-09-11'', 500000, ''TRX-2'', ' || fr || ', jsonb_build_array(jsonb_build_object(''installment_id'', ''{i2}'', ''cents'', 100)))::text', 'admin', ''],
      -- credit
      array['deposit credit (10,000, receipt + the firm''s instruction)', 'accepted', 'select public.add_credit(''{f1}'', ''2026-10-01'', 1000000, ''DEP-1'', ' || fr || ', ' || fr || ')::text', 'admin', 'dep'],
      array['use 4,000 of credit → voucher №1', '=1', 'select (public.apply_credit(''{c1}'', 400000, jsonb_build_array(jsonb_build_object(''installment_id'', ''{i2}'', ''cents'', 400000))))->>''no''', 'admin', ''],
      array['the voucher', 'accepted', 'select id::text from public.vouchers where no = 1', '', 'v1'],
      array['use 7,000 when 6,000 is left', 'SK004', 'select (public.apply_credit(''{c1}'', 700000, jsonb_build_array(jsonb_build_object(''installment_id'', ''{i2}'', ''cents'', 700000))))::text', 'admin', ''],
      array['reverse the deposit while it is in use', 'SK004', 'select ''ok'' from public.reverse_deposit(''{dep}'')', 'admin', ''],
      array['reverse the use → reversal voucher №2', '=2', 'select (public.reverse_application(''{v1}''))->>''no''', 'admin', ''],
      array['reverse the same use twice', 'SK006', 'select (public.reverse_application(''{v1}''))::text', 'admin', ''],
      array['use 1,000 → voucher №3 (no gaps)', '=3', 'select (public.apply_credit(''{c1}'', 100000, jsonb_build_array(jsonb_build_object(''installment_id'', ''{i2}'', ''cents'', 100000))))->>''no''', 'admin', ''],
      array['reverse the payment (and its split)', 'accepted', 'select ''ok'' from public.reverse_payment(''{p1}'')', 'admin', ''],
      array['reverse it again', 'SK006', 'select ''ok'' from public.reverse_payment(''{p1}'')', 'admin', ''],
      -- references and notes (allowed on a finished contract)
      array['add an outside reference file', 'accepted', 'select public.add_reference(''{c1}'', ' || fc || ')::text', 'admin', 'ref'],
      array['box on the reference', 'accepted', 'select public.add_anchor(''{ref}'', 1, ''{0.1,0.1,0.3,0.05}'')::text', 'admin', 'ra'],
      array['place it on installment 1''s amount', 'accepted', 'select public.add_link(''{c1}'', ''{ref}'', ''{ra}'', ''amount'', ''{i1}'')::text', 'admin', ''],
      array['a contract-wide note', 'accepted', 'select public.add_note(''{c1}'', null, ''late fee 1%'', ''{at}'')::text', 'admin', 'n1'],
      array['edit the note', 'accepted', 'select ''ok'' from public.edit_note(''{n1}'', ''late fee 1% per month'')', 'admin', ''],
      array['remove the note (voided, kept)', 'accepted', 'select ''ok'' from public.remove_note(''{n1}'')', 'admin', ''],
      -- a second firm's draft: build and remove an installment
      array['a draft at a second firm', 'accepted', 'select (public.create_contract(''Fabrikam'', ''FAB-1'', ''2026-09-01'', ' || fc || '))->>''contract_id''', 'admin', 'c2'],
      array['draft installment', 'accepted', 'select public.add_installment(''{c2}'', ''2026-12-01'', 500000, null, null, null)::text', 'admin', 'i3'],
      array['remove it (voided, kept)', 'accepted', 'select ''ok'' from public.remove_installment(''{i3}'')', 'admin', ''],
      array['firms: Contoso reused, Fabrikam new = 2', '=2', 'select count(*)::text from public.firms', '', ''],
      -- who may call what, and what each one reads
      array['Boss records a payment', '42501', 'select public.record_payment(''{c1}'', ''2026-09-12'', 100, ''TRX-B'', ' || fr || ', jsonb_build_array(jsonb_build_object(''installment_id'', ''{i2}'', ''cents'', 100)))::text', 'boss', ''],
      array['Boss runs the health audit', '42501', 'select count(*)::text from public.health_audit()', 'boss', ''],
      array['Boss''s snapshot: 1 contract (the draft hidden) · role · numbers 1,2', '=1/boss/1,2', 'select jsonb_array_length(s->''contracts'') || ''/'' || (s->''me''->>''role'') || ''/'' || (select string_agg(x->>''seq'', '','' order by x->>''due_on'') from jsonb_array_elements(s->''installments'') x where x->>''voided_at'' is null) from (select public.app_snapshot() s) q', 'boss', ''],
      array['Admin''s snapshot: 2 contracts · vouchers 1,2,3', '=2/1,2,3', 'select jsonb_array_length(s->''contracts'') || ''/'' || (select string_agg(x->>''no'', '','' order by (x->>''no'')::int) from jsonb_array_elements(s->''vouchers'') x) from (select public.app_snapshot() s) q', 'admin', ''],
      array['a signed-in stranger: no role, nothing', '=none/0', 'select coalesce(s->''me''->>''role'', ''none'') || ''/'' || jsonb_array_length(s->''contracts'') from (select public.app_snapshot() s) q', 'stranger', ''],
      array['a stranger creates a contract', '42501', 'select (public.create_contract(''X'', ''X-1'', null, ' || fc || '))::text', 'stranger', ''],
      array['an anonymous visitor reads the snapshot', '42501', 'select public.app_snapshot()::text', 'anon', ''],
      array['every write is in the history, signed by the Admin', '=true', 'select (count(*) > 0 and count(*) filter (where user_id is distinct from ''' || ua || ''') = 0)::text from public.audit_log where table_name <> ''app_users''', '', ''],
      array['health audit (Admin): no breaks', '=0', 'select count(*)::text from public.health_audit()', 'admin', '']
    ];
    for k in 1 .. array_length(cases, 1) loop
      q := cases[k][3]; who := cases[k][4]; exp := cases[k][2]; val := null;
      for key in select jsonb_object_keys(v) loop q := replace(q, '{' || key || '}', v ->> key); end loop;
      begin
        if who = 'anon' then
          perform set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
        elsif who <> '' then
          perform set_config('request.jwt.claims', json_build_object('sub', case who when 'admin' then ua when 'boss' then ub else us end, 'role', 'authenticated', 'aal', 'aal2')::text, true);
          set local role authenticated;
        end if;
        set constraints all deferred;
        execute q into val;
        set constraints all immediate;
        reset role; perform set_config('request.jwt.claims', '', true);
        got := case when exp like '=%' then '=' || coalesce(val, 'null') else 'accepted' end;
        if cases[k][5] <> '' then v := v || jsonb_build_object(cases[k][5], val); end if;
      exception when others then got := sqlstate;
      end;
      ok := got = exp;
      res := res || (cases[k][1] || '|' || exp || '|' || got || '|' || ok::text);
    end loop;
    raise exception 'undo everything' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  insert into b3_results select row_number() over (), split_part(x, '|', 1), split_part(x, '|', 2), split_part(x, '|', 3), split_part(x, '|', 4)::boolean from unnest(res) x;
end $do$;
select n, pass, expected, got, test from b3_results
union all select 99, (select count(*) from public.firms) + (select count(*) from public.audit_log) + (select count(*) from auth.users where email like 'qa-%@demo.saker') = 0
  and (select value from private.counters where name = 'voucher') = 0 and (select count(*) from storage.objects where bucket_id = 'documents') = 0,
  'all undone', (select count(*) from public.firms) || ' firms / ' || (select count(*) from public.audit_log) || ' log / counter ' || (select value from private.counters where name = 'voucher'), 'nothing left behind'
order by n;
