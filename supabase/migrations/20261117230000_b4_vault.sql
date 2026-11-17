-- صقر · B4, the vault (2026-11-17): Lock 3. Contracts, receipts, instructions and outside letters live in ONE private
-- bucket, never public, never replaced, never deleted. A file is read only through a short-lived signed link, and the
-- storage API issues that link only if the reader may see the document — decided by the SAME rule as the tables
-- (private.document_visible): the Admin sees all, the Boss only files of active contracts, nobody else anything.
--   upload  : the Admin only, PDF only, ≤ 25 MB, to the fixed name docs/<document id>.pdf
--   read    : per document visibility (signed links are created by the browser for 5 minutes)
--   replace : no rule → impossible for everyone (the file is never modified)
--   delete  : no rule → impossible for everyone (nothing is deleted)
-- Registration (private.new_document) now requires that the file was really uploaded first.
-- Note: the sha256 is computed by the browser before upload and stored with the document; the database cannot read
-- file bytes, so re-proving it is a client check (the viewer can recompute it on download) — not a database rule.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];

-- docs/<uuid>.pdf → the document id (null for any other name)
create or replace function private.doc_id_of(p_name text) returns uuid
  language sql immutable set search_path = '' as $$
  select (regexp_match(p_name, '^docs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$'))[1]::uuid $$;
grant execute on function private.doc_id_of(text) to authenticated;

create policy saker_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_admin()) and private.doc_id_of(name) is not null);

create policy saker_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.document_visible(private.doc_id_of(name)));

-- registration requires the uploaded file (the one place every document is born — see B3)
create or replace function private.new_document(p_file jsonb, p_firm uuid, p_contract uuid, p_kind text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p_file ->> 'id', '')::uuid;
begin
  if v_id is null then
    raise exception 'صقر: the file has no id' using errcode = 'SK003';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = 'docs/' || v_id || '.pdf') then
    raise exception 'صقر: the file was not uploaded (docs/%.pdf)', v_id using errcode = 'SK003';
  end if;
  insert into public.documents (id, firm_id, contract_id, kind, file_path, file_name, pages, sha256, created_by)
  values (v_id, p_firm, p_contract, p_kind, 'docs/' || v_id || '.pdf', p_file ->> 'file_name',
          (p_file ->> 'pages')::int, lower(p_file ->> 'sha256'), auth.uid());
  return v_id;
end $$;
revoke all on function private.new_document(jsonb, uuid, uuid, text) from public, anon, authenticated;
