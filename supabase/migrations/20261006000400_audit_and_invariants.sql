-- Audit log (invariant 8) and database-enforced invariants (3, 5, 9, gate rules).

-- Audit log ---------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  project_id uuid,
  old_value jsonb,
  new_value jsonb,
  flags text[] not null default '{}',
  prev_hash text,
  hash text not null
);
create index on public.audit_log (project_id);
create index on public.audit_log (entity, entity_id);

-- Hash chain: each entry hashes the previous one, so edits made by a
-- database superuser (who can bypass grants) are still detectable.
create function public.write_audit(
  p_action text, p_entity text, p_entity_id uuid, p_project_id uuid,
  p_old jsonb, p_new jsonb, p_flags text[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev text;
  v_at timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(724242);
  select hash into v_prev from public.audit_log order by id desc limit 1;
  insert into public.audit_log (at, actor_id, action, entity, entity_id, project_id, old_value, new_value, flags, prev_hash, hash)
  values (v_at, v_actor, p_action, p_entity, p_entity_id, p_project_id, p_old, p_new, coalesce(p_flags, '{}'), v_prev,
          encode(sha256(convert_to(concat_ws('|', v_prev, v_at, v_actor, p_action, p_entity, p_entity_id,
                                             p_project_id, p_old, p_new, p_flags), 'UTF8')), 'hex'));
end;
$$;

-- Generic row trigger: create / update / delete on every content table.
create function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_project uuid;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  v_project := case
    when tg_table_name = 'assessment_projects' then (v_row ->> 'id')::uuid
    else (v_row ->> 'project_id')::uuid
  end;
  perform public.write_audit(lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid, v_project, v_old, v_new);
  return null;
end;
$$;

create function public.audit_log_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only (invariant 8)' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_is_append_only();

revoke all on public.audit_log from public;
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated; -- rows filtered by RLS

-- updated_at + audit triggers on every content table --------------------------

do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('audit_log', 'settings')
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t.relname and column_name = 'updated_at') then
      execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t.relname);
    end if;
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t.relname);
  end loop;
end;
$$;

create trigger audit_row after insert or update or delete on public.settings
  for each row execute function public.audit_row();

-- Invariant 9: published framework versions are immutable -------------------

create function public.framework_version_of(p_table text, p_row jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if p_table in ('dimensions', 'domains', 'rating_levels', 'gate_criteria') then
    return (p_row ->> 'framework_version_id')::uuid;
  elsif p_table in ('indicators', 'signal_definitions') then
    return (select framework_version_id from public.domains where id = (p_row ->> 'domain_id')::uuid);
  end if;
  return null;
end;
$$;

create function public.guard_framework_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_status framework_status;
begin
  select status into v_status from public.framework_versions
  where id = public.framework_version_of(tg_table_name, v_row);
  if v_status is distinct from 'draft' then
    raise exception 'Framework version is % and cannot be changed (invariant 9)', v_status;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['dimensions', 'domains', 'indicators', 'rating_levels', 'signal_definitions', 'gate_criteria'] loop
    execute format('create trigger guard_framework_content before insert or update or delete on public.%I for each row execute function public.guard_framework_content()', t);
  end loop;
end;
$$;

create function public.guard_framework_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft framework versions can be deleted (invariant 9)';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.label <> old.label or new.status = 'draft') then
    raise exception 'Framework version % is % and cannot be edited (invariant 9)', old.label, old.status;
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'Retired framework versions cannot be re-published';
  end if;
  if new.status = 'published' and old.status = 'draft' then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger guard_framework_version before update or delete on public.framework_versions
  for each row execute function public.guard_framework_version();

-- Exactly one PI: the PI row cannot be removed or demoted directly ----------

create function public.guard_pi_membership() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.pi_transfer', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' and old.role = 'pi' then
    raise exception 'A project must always have exactly one PI';
  end if;
  if tg_op = 'UPDATE' and old.role = 'pi' and new.role <> 'pi' then
    raise exception 'A project must always have exactly one PI';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger guard_pi_membership before update or delete on public.project_members
  for each row execute function public.guard_pi_membership();

-- Invariant 3: evidence before judgement -----------------------------------------

create function public.enforce_rating_complete() returns trigger
language plpgsql as $$
declare
  errs text[];
  min_len int := public.setting_int('min_narrative_length', 50);
begin
  if not new.is_complete then
    return new;
  end if;
  errs := '{}';
  if new.rating is null then errs := array_append(errs, 'rating_missing'); end if;
  if coalesce(length(btrim(new.narrative)), 0) < min_len then errs := array_append(errs, 'narrative_too_short'); end if;
  if new.confidence is null then errs := array_append(errs, 'confidence_missing'); end if;
  if not exists (select 1 from public.rating_evidence_links where domain_rating_id = new.id)
     and not exists (select 1 from public.rating_gap_links where domain_rating_id = new.id) then
    errs := array_append(errs, 'evidence_or_gap_missing');
  end if;
  if cardinality(errs) > 0 then
    raise exception 'Rating cannot be marked complete: % (invariant 3)', array_to_string(errs, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enforce_rating_complete before insert or update on public.domain_ratings
  for each row execute function public.enforce_rating_complete();

-- Removing the last evidence/gap link from a complete rating would break invariant 3.
create function public.guard_last_rating_link() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.domain_ratings where id = old.domain_rating_id and is_complete)
     and (select count(*) from public.rating_evidence_links where domain_rating_id = old.domain_rating_id)
       + (select count(*) from public.rating_gap_links where domain_rating_id = old.domain_rating_id) <= 1 then
    raise exception 'Mark the rating incomplete before removing its last evidence or gap (invariant 3)'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger guard_last_rating_link before delete on public.rating_evidence_links
  for each row execute function public.guard_last_rating_link();
create trigger guard_last_rating_link before delete on public.rating_gap_links
  for each row execute function public.guard_last_rating_link();

-- Invariant 5: submitted (or withdrawn) assessments are locked ---------------------

create function public.assessment_is_editable(p_assessment_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select a.status in ('draft', 'reopened') from public.assessments a where a.id = p_assessment_id), false)
$$;

create function public.guard_assessment_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_assessment uuid;
begin
  v_assessment := case tg_table_name
    when 'domain_ratings' then (v_row ->> 'assessment_id')::uuid
    when 'indicator_responses' then (v_row ->> 'assessment_id')::uuid
    when 'integrity_reviews' then (v_row ->> 'assessment_id')::uuid
    when 'rating_evidence_links' then (select assessment_id from public.domain_ratings where id = (v_row ->> 'domain_rating_id')::uuid)
    when 'rating_gap_links' then (select assessment_id from public.domain_ratings where id = (v_row ->> 'domain_rating_id')::uuid)
    when 'integrity_flags' then (select assessment_id from public.integrity_reviews where id = (v_row ->> 'integrity_review_id')::uuid)
  end;
  if v_assessment is not null and not public.assessment_is_editable(v_assessment) then
    raise exception 'This assessment is submitted and locked (invariant 5)' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['domain_ratings', 'indicator_responses', 'rating_evidence_links', 'rating_gap_links',
                           'integrity_reviews', 'integrity_flags'] loop
    execute format('create trigger guard_assessment_lock before insert or update or delete on public.%I for each row execute function public.guard_assessment_lock()', t);
  end loop;
end;
$$;

-- Gates: decided reviews are final; automatic "No" answers cannot be overridden ---

create function public.guard_gate_review() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Gate reviews cannot be deleted (invariant 8)';
  end if;
  if old.owner_decision is not null then
    raise exception 'This gate decision is final; start a new review attempt instead';
  end if;
  return new;
end;
$$;

create trigger guard_gate_review before update or delete on public.gate_reviews
  for each row execute function public.guard_gate_review();

create function public.guard_criterion_response() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.gate_reviews where id = coalesce(new.gate_review_id, old.gate_review_id)
             and owner_decision is not null) then
    raise exception 'This gate decision is final';
  end if;
  if tg_op = 'UPDATE' and old.auto and old.answer = 'no'
     and (new.answer <> 'no' or not new.auto)
     and coalesce(current_setting('app.auto_recompute', true), '') <> 'on' then
    raise exception 'An automatic "No" cannot be overwritten (brief §6.3)';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger guard_criterion_response before insert or update or delete on public.gate_criterion_responses
  for each row execute function public.guard_criterion_response();
