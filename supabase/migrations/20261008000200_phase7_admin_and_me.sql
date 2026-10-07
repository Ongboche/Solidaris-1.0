-- Phase 7: administration and toolkit M&E instrumentation (brief §7, §11, invariants 8 and 9).

-- Users and roles ---------------------------------------------------------------------
-- Platform roles change only here (never by the user). Platform admins cannot edit
-- assessment content (brief §7): nothing below touches assessment tables.
create function public.admin_set_user(p_user uuid, p_role platform_role, p_institution uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  old_row public.profiles;
begin
  perform public.require_consented_user();
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators manage user roles';
  end if;
  select * into old_row from public.profiles where id = p_user for update;
  if old_row.id is null then
    raise exception 'User not found';
  end if;
  if old_row.platform_role = 'platform_admin' and p_role <> 'platform_admin'
     and (select count(*) from public.profiles where platform_role = 'platform_admin') <= 1 then
    raise exception 'SOLIDARIS needs at least one platform administrator';
  end if;
  if p_role = 'institution_admin' and p_institution is null then
    raise exception 'An institution admin must belong to an institution';
  end if;
  update public.profiles set platform_role = p_role, institution_id = p_institution where id = p_user;
end;
$$;

-- Framework versions (invariant 9) ---------------------------------------------------------
-- A new version starts as an editable draft copy; published versions never change.
create function public.clone_framework_version(p_from uuid, p_label text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
  dim record;
  dom record;
  v_dim uuid;
  v_dom uuid;
begin
  perform public.require_consented_user();
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators manage framework versions';
  end if;
  if not has_text(p_label) then
    raise exception 'Give the new version a label';
  end if;
  insert into public.framework_versions (label) values (btrim(p_label)) returning id into v_new;
  insert into public.rating_levels (framework_version_id, value, label, descriptor)
    select v_new, value, label, descriptor from public.rating_levels where framework_version_id = p_from;
  insert into public.gate_criteria (framework_version_id, gate, sort, text, required, auto_check_key)
    select v_new, gate, sort, text, required, auto_check_key from public.gate_criteria where framework_version_id = p_from;
  for dim in select * from public.dimensions where framework_version_id = p_from loop
    insert into public.dimensions (framework_version_id, code, label, sub_label, color_token, sort)
    values (v_new, dim.code, dim.label, dim.sub_label, dim.color_token, dim.sort) returning id into v_dim;
    for dom in select * from public.domains where dimension_id = dim.id loop
      insert into public.domains (framework_version_id, dimension_id, code, name, key_question, evidence_to_look_for, red_flags, sort)
      values (v_new, v_dim, dom.code, dom.name, dom.key_question, dom.evidence_to_look_for, dom.red_flags, dom.sort)
      returning id into v_dom;
      insert into public.indicators (domain_id, sort, prompt, guidance, example, subject_types)
        select v_dom, sort, prompt, guidance, example, subject_types from public.indicators where domain_id = dom.id;
      insert into public.signal_definitions (domain_id, description)
        select v_dom, description from public.signal_definitions where domain_id = dom.id;
    end loop;
  end loop;
  return v_new;
end;
$$;

-- Audit chain check (invariant 8) ----------------------------------------------------------
-- The hash includes the timestamp as text, which depends on the session time zone.
-- Pin hashing to UTC (Supabase's default, so existing entries stay valid) and restore the
-- caller's setting afterwards.
create or replace function public.write_audit(
  p_action text, p_entity text, p_entity_id uuid, p_project_id uuid,
  p_old jsonb, p_new jsonb, p_flags text[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev text;
  v_at timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
  v_tz text := current_setting('timezone');
  v_ds text := current_setting('datestyle');
  v_hash text;
begin
  perform pg_advisory_xact_lock(724242);
  select hash into v_prev from public.audit_log order by id desc limit 1;
  perform set_config('timezone', 'UTC', true);
  perform set_config('datestyle', 'ISO, MDY', true);
  v_hash := encode(sha256(convert_to(concat_ws('|', v_prev, v_at, v_actor, p_action, p_entity, p_entity_id,
                                               p_project_id, p_old, p_new, coalesce(p_flags, '{}')), 'UTF8')), 'hex');
  perform set_config('timezone', v_tz, true);
  perform set_config('datestyle', v_ds, true);
  insert into public.audit_log (at, actor_id, action, entity, entity_id, project_id, old_value, new_value, flags, prev_hash, hash)
  values (v_at, v_actor, p_action, p_entity, p_entity_id, p_project_id, p_old, p_new, coalesce(p_flags, '{}'), v_prev, v_hash);
end;
$$;
revoke execute on function public.write_audit(text, text, uuid, uuid, jsonb, jsonb, text[]) from public, anon, authenticated;

-- Recomputes every hash; a mismatch means an entry was altered outside the application.
create function public.verify_audit_chain() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_prev text := null;
  v_expected text;
  v_count int := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can verify the audit log';
  end if;
  perform set_config('timezone', 'UTC', true); -- same text form as write_audit
  perform set_config('datestyle', 'ISO, MDY', true);
  for e in select * from public.audit_log order by id loop
    v_count := v_count + 1;
    v_expected := encode(sha256(convert_to(concat_ws('|', v_prev, e.at, e.actor_id, e.action, e.entity, e.entity_id,
                                                     e.project_id, e.old_value, e.new_value, e.flags), 'UTF8')), 'hex');
    if e.prev_hash is distinct from v_prev or e.hash <> v_expected then
      return jsonb_build_object('entries', v_count, 'valid', false, 'first_broken_id', e.id);
    end if;
    v_prev := e.hash;
  end loop;
  return jsonb_build_object('entries', v_count, 'valid', true);
end;
$$;

-- Toolkit M&E indicators (brief §11) ------------------------------------------------------
-- Toolkit performance, computed from data, filterable by subject type, country and
-- institution. These measure the toolkit, not solidarity (PLAN D-20): no profile score.
create function public.me_indicators(p_subject_type subject_type default null, p_country text default null,
                                     p_institution uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_inst uuid := p_institution;
  r jsonb;
begin
  if not public.is_platform_admin() then
    if (select platform_role from public.profiles where id = auth.uid()) = 'institution_admin' then
      v_inst := (select institution_id from public.profiles where id = auth.uid()); -- own institution only
    else
      raise exception 'Only administrators can see the M&E dashboard';
    end if;
  end if;

  with p as (
    select ap.id, ap.institution_id from public.assessment_projects ap join public.subjects s on s.id = ap.subject_id
    where (p_subject_type is null or s.type = p_subject_type)
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
      'registrations', (select count(*) from public.profiles where deleted_at is null and (v_inst is null or institution_id = v_inst)),
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
declare s regprocedure;
begin
  foreach s in array array['public.admin_set_user(uuid,platform_role,uuid)'::regprocedure,
                           'public.clone_framework_version(uuid,text)'::regprocedure,
                           'public.verify_audit_chain()'::regprocedure,
                           'public.me_indicators(subject_type,text,uuid)'::regprocedure] loop
    execute format('revoke execute on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end;
$$;
