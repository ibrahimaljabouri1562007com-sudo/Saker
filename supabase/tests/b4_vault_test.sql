-- صقر · B4 vault test (2026-11-17). NOT a migration: run by hand (or through the Supabase connector) after any change
-- to the vault. Done AS each person against storage.objects (what the Storage API checks before an upload or before it
-- issues a signed link). Everything is UNDONE at the end. Expected: every row pass = true, "nothing left behind".
-- Proves the RULES inside the database; the live HTTP path (real upload + 5-minute link) is verified in B5/B6 with a
-- real signed-in user. First run 2026-11-17: 20/20 (delete is refused by Supabase's own guard → 42501), 0 left.
-- since B5 the database holds data (the demo + test contracts) until B8: the test counts ONLY its own rows and checks
-- 'nothing left behind' against a snapshot of the totals taken before it runs
drop table if exists qa_base;
create temp table qa_base as select (select count(*) from public.firms) as firms, (select count(*) from public.audit_log) as log,
  (select count(*) from storage.objects where bucket_id = 'documents') as files, (select value from private.counters where name = 'voucher') as counter;
create temp table if not exists b4_results (n int, test text, expected text, got text, pass boolean);
truncate b4_results;
do $do$
declare
  ua uuid := '00000000-0000-0000-0000-0000000000a1'; ub uuid := '00000000-0000-0000-0000-0000000000b1'; us uuid := '00000000-0000-0000-0000-0000000000c1';
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid(); fx uuid := gen_random_uuid();
  cases text[][]; v jsonb := '{}'; res text[] := '{}'; k int; q text; key text; val text; got text; who text; exp text; ok boolean;
begin
  begin
    insert into auth.users (id, email) values (ua, 'qa-admin@demo.saker'), (ub, 'qa-boss@demo.saker'), (us, 'qa-stranger@demo.saker');
    -- since b5_people every new account gets its app_users row by itself (role none): the test sets the roles
    update public.app_users set role = 'admin' where user_id = ua; update public.app_users set role = 'boss' where user_id = ub;
    cases := array[
      -- uploading
      array['Admin uploads docs/<id>.pdf', 'accepted', format($q$insert into storage.objects (bucket_id, name) values ('documents', 'docs/%s.pdf') returning name$q$, f1), 'admin', ''],
      array['Admin uploads a second file (for a draft)', 'accepted', format($q$insert into storage.objects (bucket_id, name) values ('documents', 'docs/%s.pdf') returning name$q$, f2), 'admin', ''],
      array['Admin uploads a third (never registered)', 'accepted', format($q$insert into storage.objects (bucket_id, name) values ('documents', 'docs/%s.pdf') returning name$q$, f3), 'admin', ''],
      array['Boss uploads a file', '42501', format($q$insert into storage.objects (bucket_id, name) values ('documents', 'docs/%s.pdf') returning name$q$, gen_random_uuid()), 'boss', ''],
      array['a stranger uploads a file', '42501', format($q$insert into storage.objects (bucket_id, name) values ('documents', 'docs/%s.pdf') returning name$q$, gen_random_uuid()), 'stranger', ''],
      array['Admin uploads under a free-form name', '42501', $q$insert into storage.objects (bucket_id, name) values ('documents', 'contracts/secret.pdf') returning name$q$, 'admin', ''],
      array['Admin replaces a stored file (renames it)', '=0', format($q$with u as (update storage.objects set name = 'docs/evil.pdf' where name = 'docs/%s.pdf' returning 1) select count(*)::text from u$q$, f1), 'admin', ''],
      array['Admin deletes a stored file (refused by Supabase''s own guard; the API has no delete rule)', '42501', format($q$with d as (delete from storage.objects where name = 'docs/%s.pdf' returning 1) select count(*)::text from d$q$, f1), 'admin', ''],
      array['…and the file is still there, unchanged', '=1', format($q$select count(*)::text from storage.objects where bucket_id = 'documents' and name = 'docs/%s.pdf'$q$, f1), '', ''],
      -- registering requires the upload
      array['register a file that was never uploaded', 'SK003', format($q$select (public.create_contract('Contoso', 'CTR-X', null, jsonb_build_object('id', %L, 'file_name', 'x.pdf', 'pages', 1, 'sha256', repeat('a', 64))))::text$q$, fx), 'admin', ''],
      array['register the uploaded contract file → contract', 'accepted', format($q$select (public.create_contract('Contoso', 'CTR-1', '2026-08-01', jsonb_build_object('id', %L, 'file_name', 'c.pdf', 'pages', 1, 'sha256', repeat('a', 64))))->>'contract_id'$q$, f1), 'admin', 'c1'],
      array['…one installment, then finish it (active)', '=no-total', 'select ''x'' from public.add_installment(''{c1}'', ''2026-09-10'', 100000, null, null, null) ; select (public.finish_contract(''{c1}''))->>''state''', 'admin', ''],
      array['a draft at another firm with the second file', 'accepted', format($q$select (public.create_contract('Fabrikam', 'FAB-1', null, jsonb_build_object('id', %L, 'file_name', 'g.pdf', 'pages', 1, 'sha256', repeat('a', 64))))->>'contract_id'$q$, f2), 'admin', ''],
      -- reading (what a signed link would be issued for)
      array['Boss can open the active contract''s file', '=1', format($q$select count(*)::text from storage.objects where name = 'docs/%s.pdf'$q$, f1), 'boss', ''],
      array['Boss cannot open the draft''s file', '=0', format($q$select count(*)::text from storage.objects where name = 'docs/%s.pdf'$q$, f2), 'boss', ''],
      array['Boss cannot open an unregistered upload', '=0', format($q$select count(*)::text from storage.objects where name = 'docs/%s.pdf'$q$, f3), 'boss', ''],
      array['Boss sees exactly 1 of the 3 test files', '=1', format($q$select count(*)::text from storage.objects where name in ('docs/%s.pdf', 'docs/%s.pdf', 'docs/%s.pdf')$q$, f1, f2, f3), 'boss', ''],
      array['Admin sees all 3 test files', '=3', format($q$select count(*)::text from storage.objects where name in ('docs/%s.pdf', 'docs/%s.pdf', 'docs/%s.pdf')$q$, f1, f2, f3), 'admin', ''],
      array['a signed-in stranger sees none', '=0', $q$select count(*)::text from storage.objects where bucket_id = 'documents'$q$, 'stranger', ''],
      array['an anonymous visitor sees none', '=0', $q$select count(*)::text from storage.objects where bucket_id = 'documents'$q$, 'anon', '']
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
        if position(' ; ' in q) > 0 then execute split_part(q, ' ; ', 1); q := split_part(q, ' ; ', 2); end if;
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
  insert into b4_results select row_number() over (), split_part(x, '|', 1), split_part(x, '|', 2), split_part(x, '|', 3), split_part(x, '|', 4)::boolean from unnest(res) x;
end $do$;
select n, pass, expected, got, test from b4_results
union all select 99, (select count(*) from public.firms) = (select firms from qa_base) and (select count(*) from public.audit_log) = (select log from qa_base)
  and (select count(*) from storage.objects where bucket_id = 'documents') = (select files from qa_base)
  and (select value from private.counters where name = 'voucher') = (select counter from qa_base)
  and (select count(*) from auth.users where email like 'qa-%@demo.saker') = 0,
  'all undone', (select count(*) from public.firms) - (select firms from qa_base) || ' firms / ' || (select count(*) from public.audit_log) - (select log from qa_base)
  || ' log / ' || (select count(*) from storage.objects where bucket_id = 'documents') - (select files from qa_base) || ' files added', 'nothing left behind'
order by n;
