-- Phase 3: evidence repository (T5, G2) and independent assessment (T3, G3).

-- Uploaded files must live under their own project's folder in the evidence bucket.
alter table public.evidence_items add constraint evidence_storage_path_in_project
  check (storage_path is null or split_part(storage_path, '/', 1) = project_id::text);

-- Automatic checks become pluggable: each phase adds public.auto_check_<key>(project, gate)
-- functions; the Phase 2 checks stay in the renamed built-in function.
alter function public.evaluate_auto_check(uuid, gate_code, text) rename to evaluate_auto_check_builtin;

create function public.evaluate_auto_check(p_project uuid, p_gate gate_code, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if p_key ~ '^[a-z0-9_]+$'
     and to_regprocedure(format('public.auto_check_%s(uuid,gate_code)', p_key)) is not null then
    execute format('select public.auto_check_%s($1, $2)', p_key) into v using p_project, p_gate;
    return v;
  end if;
  return public.evaluate_auto_check_builtin(p_project, p_gate, p_key);
end;
$$;

-- The framework domains a project is pinned to (invariant 9).
create function public.project_domains(p_project uuid) returns setof public.domains
language sql stable security definer set search_path = public as $$
  select d.* from public.domains d
  join public.assessment_projects p on p.framework_version_id = d.framework_version_id
  where p.id = p_project order by d.sort
$$;

-- G2 ------------------------------------------------------------------------------

create function public.auto_check_evidence_or_gap_all_domains(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) = 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('domains_without_evidence', coalesce(jsonb_agg(d.code order by d.sort), '[]'::jsonb)))
  from public.project_domains(p_project) d
  where not exists (select 1 from public.evidence_domain_links l join public.evidence_items e on e.id = l.evidence_id
                    where e.project_id = p_project and l.domain_id = d.id)
    and not exists (select 1 from public.evidence_gaps g where g.project_id = p_project and g.domain_id = d.id)
$$;

-- Brief §6.3 "≥2 evidence types overall" (PLAN D-16: evidence type, not origin).
create function public.auto_check_min_two_evidence_types(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(distinct type) >= 2 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('evidence_types', coalesce(jsonb_agg(distinct type), '[]'::jsonb)))
  from public.evidence_items where project_id = p_project
$$;

create function public.auto_check_community_evidence_d5_d8(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) = 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('domains_without_community_evidence', coalesce(jsonb_agg(d.code order by d.sort), '[]'::jsonb)))
  from public.project_domains(p_project) d
  where d.code in ('D5', 'D8')
    and not exists (select 1 from public.evidence_domain_links l join public.evidence_items e on e.id = l.evidence_id
                    where e.project_id = p_project and l.domain_id = d.id and e.origin = 'community')
$$;

create function public.auto_check_gaps_have_effect(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) filter (where not has_text(effect_on_confidence)) = 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('gaps', count(*), 'without_effect', count(*) filter (where not has_text(effect_on_confidence))))
  from public.evidence_gaps where project_id = p_project
$$;

-- G3 ------------------------------------------------------------------------------

-- Every assessor has submitted, or was withdrawn by the PI (PLAN D-22); at least one submitted.
create function public.auto_check_all_assessors_submitted(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (
    select s.status from public.project_members m
    left join public.assessments s on s.project_id = m.project_id and s.assessor_id = m.user_id
    where m.project_id = p_project and m.role = 'assessor')
  select jsonb_build_object(
    'answer', case when count(*) filter (where status = 'submitted') > 0
                    and count(*) filter (where status is null or status not in ('submitted', 'withdrawn')) = 0
                   then 'yes' else 'no' end,
    'evidence', jsonb_build_object(
      'assessors', count(*),
      'submitted', count(*) filter (where status = 'submitted'),
      'withdrawn', count(*) filter (where status = 'withdrawn'),
      'outstanding', count(*) filter (where status is null or status not in ('submitted', 'withdrawn'))))
  from a
$$;

create function public.auto_check_all_ratings_complete(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) > 0 and count(*) filter (where not r.is_complete) = 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('incomplete_ratings', count(*) filter (where not r.is_complete)))
  from public.assessments a join public.domain_ratings r on r.assessment_id = a.id
  where a.project_id = p_project and a.status = 'submitted'
$$;

-- Automatic-check functions are internal: only the dispatcher (security definer) calls them.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'auto\_check\_%' or p.proname in ('evaluate_auto_check', 'evaluate_auto_check_builtin', 'project_domains')) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;
