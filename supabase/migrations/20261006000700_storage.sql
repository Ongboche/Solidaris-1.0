-- Private evidence bucket (brief §12). Object paths: <project_id>/<evidence_id>/<filename>.
-- Guarded so the migration also runs where the storage schema does not exist (local PGlite tests).

create function public.can_read_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.evidence_items e
                 where e.storage_path = p_name
                   and public.can_view_evidence(e.project_id, e.confidentiality, e.created_by))
$$;

create function public.can_upload_evidence_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_project uuid;
begin
  begin
    v_project := split_part(p_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.has_project_role(v_project, array['pi', 'assessor']::project_role[]) and public.project_open(v_project);
end;
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false)
    on conflict (id) do update set public = false;

    execute $p$create policy evidence_read on storage.objects for select to authenticated
      using (bucket_id = 'evidence' and public.can_read_evidence_object(name))$p$;
    execute $p$create policy evidence_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'evidence' and public.can_upload_evidence_object(name))$p$;
    execute $p$create policy evidence_delete on storage.objects for delete to authenticated
      using (bucket_id = 'evidence' and owner = auth.uid() and public.can_upload_evidence_object(name))$p$;
  end if;
end;
$$;
