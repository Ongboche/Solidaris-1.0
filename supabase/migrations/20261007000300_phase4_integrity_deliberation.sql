-- Phase 4: integrity & anti-capture (T4, G4) and deliberation & consensus (T6, G5).

-- Profile approval (SRS §10.17: no profile before PI approval; PLAN D-18). Set only by approve_profile().
alter table public.assessment_projects
  add column profile_approved_at timestamptz,
  add column profile_approved_by uuid references auth.users (id);

-- Integrity reviews: the team edits the answers; reviewer QA goes through record_integrity_qa().
revoke update on public.integrity_reviews from authenticated;
grant update (alignment_goal_contradictions, alignment_funder_portfolio, alignment_values_vs_allocation,
              cost_who_bears, cost_transaction_proportionate, cost_shifted_to_local, cost_indirect_covered,
              voice_actual_involvement, voice_veto_power, voice_grievance_mechanisms, voice_input_led_to_change,
              primary_type, secondary_type, type_evidence)
  on public.integrity_reviews to authenticated;

create function public.integrity_missing(p_review uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when not has_text(r.alignment_goal_contradictions) then 'alignment_goal_contradictions' end,
    case when not has_text(r.alignment_funder_portfolio) then 'alignment_funder_portfolio' end,
    case when not has_text(r.alignment_values_vs_allocation) then 'alignment_values_vs_allocation' end,
    case when not has_text(r.cost_who_bears) then 'cost_who_bears' end,
    case when not has_text(r.cost_transaction_proportionate) then 'cost_transaction_proportionate' end,
    case when not has_text(r.cost_shifted_to_local) then 'cost_shifted_to_local' end,
    case when not has_text(r.cost_indirect_covered) then 'cost_indirect_covered' end,
    case when not has_text(r.voice_actual_involvement) then 'voice_actual_involvement' end,
    case when not has_text(r.voice_veto_power) then 'voice_veto_power' end,
    case when not has_text(r.voice_grievance_mechanisms) then 'voice_grievance_mechanisms' end,
    case when not has_text(r.voice_input_led_to_change) then 'voice_input_led_to_change' end], null)
  from public.integrity_reviews r where r.id = p_review
$$;

create function public.integrity_flags_missing(p_review uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(f::text order by f), '{}')
  from unnest(enum_range(null::risk_flag)) f
  where not exists (select 1 from public.integrity_flags x where x.integrity_review_id = p_review and x.flag = f)
$$;

-- PLAN D-7 / D-36: an assessor's own integrity review (all four flags and a primary
-- solidarity type) is the last step before submitting (SRS §8.4).
create or replace function public.submit_assessment(p_assessment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  a public.assessments;
  v_incomplete text[];
  v_review public.integrity_reviews;
begin
  select * into a from public.assessments where id = p_assessment for update;
  if a.id is null or a.assessor_id <> v_user then
    raise exception 'You can only submit your own assessment';
  end if;
  if a.status not in ('draft', 'reopened') then
    raise exception 'This assessment is already %', a.status;
  end if;
  if public.project_status_of(a.project_id) <> 'assessment' then
    raise exception 'The assessment stage for this project is closed';
  end if;

  select array_agg(d.code order by d.sort) into v_incomplete
  from public.project_domains(a.project_id) d
  left join public.domain_ratings r on r.assessment_id = a.id and r.domain_id = d.id
  where coalesce(r.is_complete, false) = false;
  if v_incomplete is not null then
    raise exception 'Complete these domains before submitting: %', array_to_string(v_incomplete, ', ')
      using errcode = 'check_violation';
  end if;

  select * into v_review from public.integrity_reviews where assessment_id = a.id and scope = 'assessor';
  if v_review.id is null or cardinality(public.integrity_flags_missing(v_review.id)) > 0 or v_review.primary_type is null then
    raise exception 'Complete your integrity review (all four risk flags and a primary solidarity type) before submitting'
      using errcode = 'check_violation';
  end if;

  update public.assessments set status = 'submitted', submitted_at = now() where id = a.id;
  perform public.write_audit('submit', 'assessments', a.id, a.project_id, null, null);
end;
$$;

create function public.record_integrity_qa(p_project uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
begin
  if not public.has_project_role(p_project, array['reviewer']::project_role[]) then
    raise exception 'Only a reviewer records integrity QA';
  end if;
  if public.project_status_of(p_project) <> 'integrity' then
    raise exception 'Integrity QA happens at the integrity stage';
  end if;
  update public.integrity_reviews set qa_by = v_user, qa_at = now(), qa_notes = p_notes
  where project_id = p_project and scope = 'project';
  if not found then
    raise exception 'Start the project integrity review before QA';
  end if;
end;
$$;

-- G4 ------------------------------------------------------------------------------

create function public.project_integrity_review(p_project uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.integrity_reviews where project_id = p_project and scope = 'project'
$$;

create function public.auto_check_integrity_sections_complete(p_project uuid, p_gate gate_code) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_review uuid := public.project_integrity_review(p_project);
  v_missing text[];
begin
  if v_review is null then
    return jsonb_build_object('answer', 'no', 'evidence', jsonb_build_object('review_started', false));
  end if;
  v_missing := public.integrity_missing(v_review);
  return jsonb_build_object('answer', case when cardinality(v_missing) = 0 then 'yes' else 'no' end,
                            'evidence', jsonb_build_object('missing_sections', v_missing));
end;
$$;

-- "Every High explained" is enforced by a CHECK on integrity_flags.
create function public.auto_check_flags_rated_high_explained(p_project uuid, p_gate gate_code) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_review uuid := public.project_integrity_review(p_project);
  v_missing text[];
begin
  if v_review is null then
    return jsonb_build_object('answer', 'no', 'evidence', jsonb_build_object('review_started', false));
  end if;
  v_missing := public.integrity_flags_missing(v_review);
  return jsonb_build_object('answer', case when cardinality(v_missing) = 0 then 'yes' else 'no' end,
                            'evidence', jsonb_build_object('missing_flags', v_missing));
end;
$$;

create function public.auto_check_solidarity_type_set(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when r.primary_type is not null and has_text(r.type_evidence) then 'yes' else 'no' end,
    'evidence', jsonb_build_object('primary_type', r.primary_type, 'type_evidence', has_text(r.type_evidence)))
  from (select 1) x
  left join public.integrity_reviews r on r.project_id = p_project and r.scope = 'project'
$$;

create function public.auto_check_community_participant_scheduled(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) > 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('community_participants', count(*)))
  from public.project_members where project_id = p_project and role = 'community_participant'
$$;

-- Deliberation (T6) -------------------------------------------------------------------

-- Exploratory = flagged single-assessor, or fewer than two submitted assessments (PLAN D-22).
create function public.is_exploratory(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select single_assessor from public.assessment_projects where id = p_project), false)
      or (select count(*) from public.assessments where project_id = p_project and status = 'submitted') < 2
$$;

-- Per-domain divergence: max − min of submitted ratings, NULLs ignored (brief §6.4).
-- Never aggregated across domains (invariant 1).
create function public.domain_divergence(p_project uuid)
returns table (domain_id uuid, code text, rated int, divergence int, needs_discussion boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.code, count(r.rating)::int,
         case when count(r.rating) >= 2 then (max(r.rating) - min(r.rating))::int end,
         coalesce(count(r.rating) >= 2 and max(r.rating) - min(r.rating) > public.setting_int('agreement_threshold', 1), false)
  from public.project_domains(p_project) d
  left join (public.domain_ratings r join public.assessments a on a.id = r.assessment_id
             and a.project_id = p_project and a.status = 'submitted') on r.domain_id = d.id
  group by d.id, d.code, d.sort
  order by d.sort
$$;

create function public.auto_check_divergent_domains_discussed(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) = 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('undiscussed_domains', coalesce(jsonb_agg(v.code), '[]'::jsonb)))
  from public.domain_divergence(p_project) v
  where v.needs_discussion
    and not exists (select 1 from public.domain_discussions x where x.project_id = p_project and x.domain_id = v.domain_id)
$$;

-- Each domain needs a consensus rating, or documented dissent (brief Appendix B).
-- Exploratory projects have nothing to reconcile (PLAN D-18).
create function public.auto_check_consensus_or_dissent_all(p_project uuid, p_gate gate_code) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if public.is_exploratory(p_project) then
    return jsonb_build_object('answer', 'yes', 'evidence', jsonb_build_object('exploratory', true));
  end if;
  select jsonb_build_object(
    'answer', case when count(*) = 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('domains_missing', coalesce(jsonb_agg(d.code order by d.sort), '[]'::jsonb)))
  into v
  from public.project_domains(p_project) d
  where not exists (select 1 from public.consensus_ratings c where c.project_id = p_project and c.domain_id = d.id and c.rating is not null)
    and not exists (select 1 from public.dissent_records x where x.project_id = p_project and x.domain_id = d.id);
  return v;
end;
$$;

-- Consensus approval chain (SRS §10.17): draft → reviewer verification → PI approval → locked.
create function public.guard_consensus() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
begin
  if (select profile_approved_at from public.assessment_projects where id = v_project) is not null then
    raise exception 'The profile is approved and consensus is locked';
  end if;
  if coalesce(current_setting('app.consensus_approval', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.reviewer_verified_by := null; new.reviewer_verified_at := null;
      new.pi_approved_by := null; new.pi_approved_at := null;
    elsif tg_op = 'UPDATE' and (new.rating, new.category, new.rationale, new.confidence)
                              is distinct from (old.rating, old.category, old.rationale, old.confidence) then
      -- Any change sends the domain back for verification.
      new.reviewer_verified_by := null; new.reviewer_verified_at := null;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger guard_consensus before insert or update or delete on public.consensus_ratings
  for each row execute function public.guard_consensus();

create function public.verify_consensus(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_missing int;
begin
  if not public.has_project_role(p_project, array['reviewer']::project_role[]) then
    raise exception 'Only a reviewer verifies consensus';
  end if;
  if public.project_status_of(p_project) not in ('deliberation', 'validation') then
    raise exception 'Consensus is verified during deliberation or validation';
  end if;
  select count(*) into v_missing from public.project_domains(p_project) d
  where not exists (select 1 from public.consensus_ratings c where c.project_id = p_project and c.domain_id = d.id);
  if v_missing > 0 then
    raise exception 'Record a consensus outcome for every domain first (% missing)', v_missing;
  end if;
  perform set_config('app.consensus_approval', 'on', true);
  update public.consensus_ratings set reviewer_verified_by = v_user, reviewer_verified_at = now() where project_id = p_project;
  perform set_config('app.consensus_approval', 'off', true);
  perform public.write_audit('verify_consensus', 'assessment_projects', p_project, p_project, null, null);
end;
$$;

create function public.approve_profile(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
begin
  if not public.has_project_role(p_project, array['pi']::project_role[]) then
    raise exception 'Only the PI approves the profile';
  end if;
  if public.project_status_of(p_project) not in ('deliberation', 'validation') then
    raise exception 'The profile is approved during deliberation or validation';
  end if;
  if (select count(*) from public.assessments where project_id = p_project and status = 'submitted') = 0 then
    raise exception 'There are no submitted assessments to build a profile from';
  end if;
  if not public.is_exploratory(p_project) then
    if exists (select 1 from public.project_domains(p_project) d
               where not exists (select 1 from public.consensus_ratings c where c.project_id = p_project and c.domain_id = d.id
                                 and c.reviewer_verified_at is not null)) then
      raise exception 'A reviewer must verify a consensus outcome for every domain before approval';
    end if;
    perform set_config('app.consensus_approval', 'on', true);
    update public.consensus_ratings set pi_approved_by = v_user, pi_approved_at = now() where project_id = p_project;
    perform set_config('app.consensus_approval', 'off', true);
  end if;
  update public.assessment_projects set profile_approved_at = now(), profile_approved_by = v_user where id = p_project;
  perform public.write_audit('approve_profile', 'assessment_projects', p_project, p_project, null,
                             jsonb_build_object('exploratory', public.is_exploratory(p_project)));
end;
$$;

do $$
declare
  f record;
  s regprocedure;
begin
  -- domain_divergence stays internal: before G3 even the spread of ratings must not leak (invariant 4).
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'auto\_check\_%' or p.proname in
             ('integrity_missing', 'integrity_flags_missing', 'project_integrity_review', 'guard_consensus',
              'domain_divergence')) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  foreach s in array array['public.record_integrity_qa(uuid,text)'::regprocedure, 'public.verify_consensus(uuid)'::regprocedure,
                           'public.approve_profile(uuid)'::regprocedure, 'public.is_exploratory(uuid)'::regprocedure] loop
    execute format('revoke execute on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end;
$$;
