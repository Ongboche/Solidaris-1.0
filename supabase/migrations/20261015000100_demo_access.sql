-- Demo profile (brief §9.11: "a sample read-only project to explore"; PLAN D-53).
-- Every signed-in, consented user can READ a demo project. Nobody can change it: writes are
-- refused by a trigger regardless of role, and demo projects never count in M&E indicators.

alter table public.assessment_projects add column is_demo boolean not null default false;
alter table public.profiles add column is_demo boolean not null default false; -- fictional demo personas

create function public.is_demo_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_demo from public.assessment_projects where id = p_project), false)
$$;

create function public.can_read_demo(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_demo_project(p_project) and public.has_consented()
$$;

-- READ helpers gain the demo; role-based WRITE helpers (has_project_role, can_manage_project,
-- can_edit_assessment) are unchanged, so demo readers can never write.
create or replace function public.is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_consented() and (
    exists (select 1 from public.project_members where project_id = p_project and user_id = auth.uid())
    or public.is_demo_project(p_project))
$$;

create or replace function public.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_member(p_project)
      or public.is_institution_admin(public.project_institution(p_project))
$$;

create or replace function public.can_view_assessment(p_assessment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment
      and (a.assessor_id = auth.uid() and public.has_consented()
           or public.can_read_demo(a.project_id)
           or (public.project_passed(a.project_id, 'G2')
               and public.has_project_role(a.project_id,
                     array['pi', 'assessor', 'reviewer', 'external_expert', 'community_participant']::project_role[]))))
$$;

create or replace function public.can_deliberate(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_read_demo(p_project)
      or (public.project_passed(p_project, 'G2')
          and public.has_project_role(p_project,
                array['pi', 'assessor', 'reviewer', 'external_expert', 'community_participant']::project_role[]))
$$;

create or replace function public.can_view_profile_outputs(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_read_demo(p_project)
      or public.has_project_role(p_project, array['pi', 'assessor', 'reviewer', 'external_expert', 'kt_lead']::project_role[])
      or public.is_institution_admin(public.project_institution(p_project))
      or (public.project_passed(p_project, 'G6')
          and public.has_project_role(p_project, array['observer', 'community_participant']::project_role[]))
$$;

-- Read-only guard ---------------------------------------------------------------------
-- Resolves the project of any row (directly or through its parent) and refuses changes to
-- demo projects unless the demo seed itself is running.
create function public.row_project(p_table text, p_row jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if p_row ? 'project_id' then return (p_row ->> 'project_id')::uuid; end if;
  return case p_table
    when 'assessment_projects' then (p_row ->> 'id')::uuid
    when 'domain_ratings' then (select project_id from public.assessments where id = (p_row ->> 'assessment_id')::uuid)
    when 'indicator_responses' then (select project_id from public.assessments where id = (p_row ->> 'assessment_id')::uuid)
    when 'rating_evidence_links' then (select a.project_id from public.domain_ratings r join public.assessments a on a.id = r.assessment_id where r.id = (p_row ->> 'domain_rating_id')::uuid)
    when 'rating_gap_links' then (select a.project_id from public.domain_ratings r join public.assessments a on a.id = r.assessment_id where r.id = (p_row ->> 'domain_rating_id')::uuid)
    when 'evidence_domain_links' then (select project_id from public.evidence_items where id = (p_row ->> 'evidence_id')::uuid)
    when 'integrity_flags' then (select project_id from public.integrity_reviews where id = (p_row ->> 'integrity_review_id')::uuid)
    when 'deliberation_participants' then (select project_id from public.deliberation_sessions where id = (p_row ->> 'session_id')::uuid)
    when 'gate_criterion_responses' then (select project_id from public.gate_reviews where id = (p_row ->> 'gate_review_id')::uuid)
    when 'gate_verifications' then (select project_id from public.gate_reviews where id = (p_row ->> 'gate_review_id')::uuid)
  end;
end;
$$;

create function public.guard_demo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if coalesce(current_setting('app.demo_seed', true), '') <> 'on'
     and public.is_demo_project(public.row_project(tg_table_name, v_row)) then
    raise exception 'The demo profile is read-only' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'assessment_projects', 'project_members', 'invitations', 'decision_records', 'context_profiles', 'actors',
    'evidence_items', 'evidence_domain_links', 'evidence_gaps', 'assessments', 'indicator_responses', 'domain_ratings',
    'rating_evidence_links', 'rating_gap_links', 'integrity_reviews', 'integrity_flags', 'deliberation_sessions',
    'deliberation_participants', 'domain_discussions', 'consensus_ratings', 'dissent_records', 'member_checks',
    'report_drafts', 'report_downloads', 'kt_products', 'uptake_events', 'follow_up_reviews', 'framework_lessons',
    'signal_observations', 'gate_reviews', 'gate_criterion_responses', 'gate_verifications', 'action_items',
    'decision_responses', 'notifications'] loop
    execute format('create trigger guard_demo before insert or update or delete on public.%I for each row execute function public.guard_demo()', t);
  end loop;
end;
$$;

-- Demo projects and demo personas never count as toolkit usage (brief §11) ---------------
create or replace function public.me_indicators(p_subject_type subject_type default null, p_country text default null,
                                                p_institution uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_inst uuid := p_institution;
  r jsonb;
begin
  if not public.is_platform_admin() then
    if (select platform_role from public.profiles where id = auth.uid()) = 'institution_admin' then
      v_inst := (select institution_id from public.profiles where id = auth.uid());
    else
      raise exception 'Only administrators can see the M&E dashboard';
    end if;
  end if;

  with p as (
    select ap.id, ap.institution_id from public.assessment_projects ap join public.subjects s on s.id = ap.subject_id
    where not ap.is_demo
      and (p_subject_type is null or s.type = p_subject_type)
      and (p_country is null or lower(s.country) = lower(btrim(p_country)))
      and (v_inst is null or ap.institution_id = v_inst)),
  passed as (
    select project_id, gate, min(decided_at) as at from public.gate_reviews
    where owner_decision in ('go', 'conditional_go') and project_id in (select id from p)
    group by project_id, gate),
  firsts as (
    select distinct on (project_id, gate) project_id, gate, owner_decision from public.gate_reviews
    where owner_decision is not null and project_id in (select id from p)
    order by project_id, gate, attempt_number),
  div as (select x.* from p cross join lateral public.domain_divergence(p.id) x where x.rated >= 2),
  cons as (select c.* from public.consensus_ratings c where c.project_id in (select id from p)),
  hi as (
    select f.* from public.integrity_flags f join public.integrity_reviews r on r.id = f.integrity_review_id
    where r.scope = 'project' and r.project_id in (select id from p) and f.level = 'high')
  select jsonb_build_object(
    'projects', (select count(*) from p),
    'oc1', jsonb_build_object(
      'decisions_considering_profile', (select count(*) from public.uptake_events where project_id in (select id from p)),
      'released_profiles', (select count(*) from passed where gate = 'G6'),
      'released_with_action_plan', (select count(*) from passed g7
         join public.decision_responses d on d.project_id = g7.project_id and d.response_type = 'action_plan'
         where g7.gate = 'G7' and g7.project_id in (select project_id from passed where gate = 'G6')),
      'use_types', (select coalesce(jsonb_object_agg(use_type, n), '{}'::jsonb)
                    from (select use_type, count(*) as n from public.uptake_events
                          where project_id in (select id from p) group by use_type) u)),
    'oc2', jsonb_build_object(
      'domains_compared', (select count(*) from div),
      'domains_within_threshold', (select count(*) from div where not needs_discussion),
      'consensus_ratings', (select count(*) from cons where rating is not null),
      'consensus_medium_high', (select count(*) from cons where rating is not null and confidence in ('medium', 'high')),
      'member_checks_rated', (select count(relevance) from public.member_checks where project_id in (select id from p)),
      'member_check_relevance_mean', (select round(avg(relevance)::numeric, 1) from public.member_checks where project_id in (select id from p))),
    'oc3', jsonb_build_object(
      'deliberating_projects', (select count(*) from passed where gate = 'G4'),
      'with_community_participant', (
        select count(distinct s.project_id) from public.deliberation_sessions s
        join public.deliberation_participants dp on dp.session_id = s.id
        join public.project_members m on m.project_id = s.project_id and m.user_id = dp.user_id and m.role = 'community_participant'
        where s.project_id in (select id from p)),
      'high_flags', (select count(*) from hi),
      'high_flags_explained', (select count(*) from hi where has_text(explanation)),
      'non_consensus_domains', (select count(*) from cons where category in ('no_consensus', 'deferred_pending_evidence')),
      'non_consensus_with_dissent', (select count(*) from cons c where c.category in ('no_consensus', 'deferred_pending_evidence')
         and exists (select 1 from public.dissent_records d where d.project_id = c.project_id and d.domain_id = c.domain_id))),
    'oc4', jsonb_build_object(
      'institutions_past_g6', (select count(distinct x.institution_id) from p x join passed g on g.project_id = x.id and g.gate = 'G6'
                               where x.institution_id is not null),
      'registrations', (select count(*) from public.profiles where deleted_at is null and not is_demo
                        and (v_inst is null or institution_id = v_inst)),
      'report_downloads', (select count(*) from public.report_downloads where project_id in (select id from p))),
    'op3', jsonb_build_object(
      'median_days_g0_to_g6', (select round((percentile_cont(0.5) within group (order by extract(epoch from g6.at - g0.at) / 86400))::numeric, 1)
                               from passed g0 join passed g6 on g6.project_id = g0.project_id and g6.gate = 'G6' where g0.gate = 'G0'),
      'first_pass', (select coalesce(jsonb_object_agg(gate, jsonb_build_object('reviewed', n, 'passed_first_time', ok)), '{}'::jsonb)
                     from (select gate, count(*) as n, count(*) filter (where owner_decision in ('go', 'conditional_go')) as ok
                           from firsts group by gate) f),
      'recent_hold_reasons', (select coalesce(jsonb_agg(jsonb_build_object('gate', gate, 'reason', rationale, 'at', decided_at)), '[]'::jsonb)
                              from (select gate, rationale, decided_at from public.gate_reviews
                                    where owner_decision = 'hold' and project_id in (select id from p)
                                    order by decided_at desc limit 20) h))
  ) into r;
  return r;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['is_demo_project(uuid)', 'can_read_demo(uuid)', 'row_project(text, jsonb)', 'guard_demo()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end;
$$;
