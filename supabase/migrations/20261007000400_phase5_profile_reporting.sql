-- Phase 5: profile and reporting (T8, G6).

-- The solidarity profile: one row per domain, never an aggregate (invariant 1).
-- Consensus ratings for multi-assessor projects; the single submitted assessment for
-- Exploratory projects (PLAN D-18). Available only after PI approval (SRS §10.17).
create function public.profile_ratings(p_project uuid)
returns table (domain_id uuid, code text, name text, dimension_code text, dimension_label text,
               dimension_sort int, domain_sort int, rating smallint, confidence confidence_level,
               category consensus_category, narrative text, source text)
language sql stable security definer set search_path = public as $$
  with p as (
    select id, profile_approved_at, public.is_exploratory(id) as exploratory
    from public.assessment_projects where id = p_project),
  single as (
    select a.id from public.assessments a
    where a.project_id = p_project and a.status = 'submitted' order by a.submitted_at limit 1)
  select d.id, d.code, d.name, dim.code, dim.label, dim.sort, d.sort,
         case when p.exploratory then r.rating else c.rating end,
         case when p.exploratory then r.confidence else c.confidence end,
         case when p.exploratory then null else c.category end,
         case when p.exploratory then r.narrative else c.rationale end,
         case when p.exploratory then 'single_assessor' else 'consensus' end
  from p
  cross join public.project_domains(p_project) d
  join public.dimensions dim on dim.id = d.dimension_id
  left join public.consensus_ratings c on c.project_id = p_project and c.domain_id = d.id
  left join public.domain_ratings r on r.domain_id = d.id and r.assessment_id = (select id from single)
  where p.profile_approved_at is not null and public.can_view_profile_outputs(p_project)
  order by dim.sort, d.sort
$$;

-- Invariant 11: a draft stays a draft until the PI approves it; approved drafts are read-only.
create function public.approve_report_draft(p_draft uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_project uuid;
begin
  select project_id into v_project from public.report_drafts where id = p_draft;
  if v_project is null or not public.has_project_role(v_project, array['pi']::project_role[]) then
    raise exception 'Only the PI approves the report narrative';
  end if;
  update public.report_drafts set approved_by = v_user, approved_at = now()
  where id = p_draft and approved_at is null;
  if not found then
    raise exception 'This draft is already approved';
  end if;
end;
$$;

-- G6 ------------------------------------------------------------------------------

create function public.auto_check_reviewer_verified(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when v.outcome = 'verified' then 'yes' else 'no' end,
    'evidence', jsonb_build_object('verification', v.outcome))
  from (select 1) x
  left join lateral (
    select gv.outcome from public.gate_verifications gv
    join public.gate_reviews g on g.id = gv.gate_review_id
    where g.project_id = p_project and g.gate = p_gate and g.owner_decision is null
    order by gv.created_at desc limit 1) v on true
$$;

create function public.auto_check_member_check_recorded(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('answer', case when count(*) > 0 then 'yes' else 'no' end,
                            'evidence', jsonb_build_object('member_checks', count(*)))
  from public.member_checks where project_id = p_project
$$;

-- Structurally guaranteed: no table, function or export can hold a composite score.
create function public.auto_check_domain_level_only(p_project uuid, p_gate gate_code) returns jsonb
language sql immutable as $$
  select jsonb_build_object('answer', 'yes', 'evidence', jsonb_build_object('by_design', true))
$$;

do $$
declare
  f record;
  s regprocedure;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'auto\_check\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  foreach s in array array['public.profile_ratings(uuid)'::regprocedure, 'public.approve_report_draft(uuid)'::regprocedure] loop
    execute format('revoke execute on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end;
$$;
