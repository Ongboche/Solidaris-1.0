-- Workflow RPCs (PLAN §3.4, §4). All security definer, all audit-logged.
-- The client can never move a project forward by writing to tables directly (brief §4.2).

-- Pure helpers mirrored in src/domain (shared fixtures keep them in step) ----

create function public.gate_for_status(p_status project_status) returns gate_code
language sql immutable as $$
  select case p_status
    when 'scoping' then 'G0' when 'context' then 'G1' when 'evidence' then 'G2'
    when 'assessment' then 'G3' when 'integrity' then 'G4' when 'deliberation' then 'G5'
    when 'validation' then 'G6' when 'uptake' then 'G7' when 'learning' then 'G8'
  end::gate_code
$$;

create function public.next_status(p_status project_status, p_decision gate_decision) returns project_status
language sql immutable as $$
  select case
    when p_decision = 'stop_redirect' then 'closed'::project_status
    when p_decision = 'hold' then p_status
    else case p_status
      when 'scoping' then 'context' when 'context' then 'evidence' when 'evidence' then 'assessment'
      when 'assessment' then 'integrity' when 'integrity' then 'deliberation'
      when 'deliberation' then 'validation' when 'validation' then 'uptake'
      when 'uptake' then 'learning' when 'learning' then 'closed'
    end::project_status
  end
$$;

-- Gate owners (brief §6.3). G2/G6 are decided by the PI after reviewer verification (PLAN D-12).
create function public.gate_owner_role(p_gate gate_code) returns project_role
language sql immutable as $$
  select case p_gate when 'G4' then 'reviewer' when 'G7' then 'kt_lead' else 'pi' end::project_role
$$;

-- Suggested decision (brief §6.2). Input: [{criterion_id, required, answer, note}].
-- "partial" never counts as met; "na" counts only with a note.
create function public.suggest_decision(p_criteria jsonb) returns jsonb
language plpgsql immutable as $$
declare
  c jsonb;
  v_answer text;
  v_ref text;
  v_answered int := 0;
  v_any_no boolean := false;
  v_all_met boolean := true;
  v_reasons text[] := '{}';
begin
  for c in select * from jsonb_array_elements(coalesce(p_criteria, '[]'::jsonb)) loop
    v_answer := c ->> 'answer';
    v_ref := coalesce(c ->> 'criterion_id', '?');
    if v_answer is not null then
      v_answered := v_answered + 1;
    end if;
    if coalesce((c ->> 'required')::boolean, false) then
      if v_answer is null then
        v_all_met := false; v_reasons := v_reasons || ('required_unanswered:' || v_ref);
      elsif v_answer = 'no' then
        v_any_no := true; v_all_met := false; v_reasons := v_reasons || ('required_no:' || v_ref);
      elsif v_answer = 'partial' then
        v_all_met := false; v_reasons := v_reasons || ('required_partial:' || v_ref);
      elsif v_answer = 'na' and not public.has_text(c ->> 'note') then
        v_all_met := false; v_reasons := v_reasons || ('na_missing_note:' || v_ref);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'decision', case when v_answered = 0 then 'not_started'
                     when v_any_no then 'hold'
                     when v_all_met then 'go'
                     else 'conditional_go' end,
    'reasons', to_jsonb(case when v_answered = 0 then '{}'::text[] else v_reasons end));
end;
$$;

create function public.decision_rank(p_decision text) returns int
language sql immutable as $$
  select case p_decision when 'hold' then 0 when 'conditional_go' then 1 when 'go' then 2 else -1 end
$$;

-- Internal helpers --------------------------------------------------------------

create function public.require_consented_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_consented() then
    raise exception 'Please accept the data protection notice first' using errcode = 'insufficient_privilege';
  end if;
  return auth.uid();
end;
$$;

create function public.review_criteria_json(p_review uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'criterion_id', gc.id, 'required', gc.required, 'answer', r.answer, 'note', r.note) order by gc.sort), '[]'::jsonb)
  from public.gate_reviews g
  join public.assessment_projects p on p.id = g.project_id
  join public.gate_criteria gc on gc.framework_version_id = p.framework_version_id and gc.gate = g.gate
  left join public.gate_criterion_responses r on r.gate_review_id = g.id and r.criterion_id = gc.id
  where g.id = p_review
$$;

-- Account -----------------------------------------------------------------------

create function public.record_consent(p_processing boolean, p_handling boolean, p_email boolean, p_notice_version text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in';
  end if;
  if not (coalesce(p_processing, false) and coalesce(p_handling, false)) then
    raise exception 'Both required consents are needed to use SOLIDARIS';
  end if;
  if not public.has_text(p_notice_version) then
    raise exception 'Notice version is required';
  end if;
  update public.profiles set
    consent_processing_at = coalesce(consent_processing_at, now()),
    consent_handling_at = coalesce(consent_handling_at, now()),
    consent_email_at = case when p_email then coalesce(consent_email_at, now()) end,
    consent_notice_version = p_notice_version
  where id = auth.uid();
end;
$$;

-- Team names without exposing emails to every co-member.
create function public.project_member_profiles(p_project uuid)
returns table (user_id uuid, full_name text, institution text, role project_role)
language sql stable security definer set search_path = public as $$
  select m.user_id, pr.full_name, coalesce(i.name, pr.institution_name), m.role
  from public.project_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.institutions i on i.id = pr.institution_id
  where m.project_id = p_project and public.can_view_project(p_project)
  order by m.role, pr.full_name
$$;

-- Projects ------------------------------------------------------------------------

create function public.create_project(
  p_subject_type subject_type, p_subject_name text,
  p_country text default null, p_region text default null, p_description text default null,
  p_assessment_type assessment_type default 'baseline', p_institution uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_framework uuid;
  v_subject uuid;
  v_project uuid;
begin
  if p_institution is not null and not exists (
       select 1 from public.profiles where id = v_user and institution_id = p_institution) then
    raise exception 'You can only create projects for your own institution';
  end if;
  select id into v_framework from public.framework_versions
  where status = 'published' order by published_at desc limit 1;
  if v_framework is null then
    raise exception 'No published framework version is available';
  end if;

  insert into public.subjects (type, name, country, region, description, institution_id, created_by)
  values (p_subject_type, p_subject_name, p_country, p_region, p_description, p_institution, v_user)
  returning id into v_subject;

  insert into public.assessment_projects (subject_id, institution_id, framework_version_id, assessment_type, created_by)
  values (v_subject, p_institution, v_framework, p_assessment_type, v_user)
  returning id into v_project;

  insert into public.project_members (project_id, user_id, role, created_by)
  values (v_project, v_user, 'pi', v_user);

  return v_project;
end;
$$;

-- draft → scoping is a setup step, not a gate (PLAN D-4).
create function public.start_scoping(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_consented_user();
  if not public.has_project_role(p_project, array['pi']::project_role[]) then
    raise exception 'Only the PI can start scoping';
  end if;
  update public.assessment_projects set status = 'scoping' where id = p_project and status = 'draft';
  if not found then
    raise exception 'Scoping can only start from a draft project';
  end if;
  perform public.write_audit('start_scoping', 'assessment_projects', p_project, p_project, null, null);
end;
$$;

-- Assessments (T3) --------------------------------------------------------------------

create function public.start_assessment(p_project uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_assessment uuid;
begin
  if not public.has_project_role(p_project, array['assessor']::project_role[]) then
    raise exception 'Only assessors on this project can start an assessment';
  end if;
  if public.project_status_of(p_project) <> 'assessment' then
    raise exception 'Assessments open once the project reaches the assessment stage';
  end if;

  select id into v_assessment from public.assessments where project_id = p_project and assessor_id = v_user;
  if v_assessment is not null then
    return v_assessment;
  end if;

  insert into public.assessments (project_id, assessor_id, created_by)
  values (p_project, v_user, v_user) returning id into v_assessment;

  -- One unrated row per domain: unrated is NULL, never 0 (invariant 2).
  insert into public.domain_ratings (assessment_id, domain_id, created_by)
  select v_assessment, d.id, v_user
  from public.domains d
  join public.assessment_projects p on p.framework_version_id = d.framework_version_id
  where p.id = p_project;

  return v_assessment;
end;
$$;

create function public.submit_assessment(p_assessment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  a public.assessments;
  v_incomplete text[];
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
  from public.domains d
  join public.assessment_projects p on p.framework_version_id = d.framework_version_id and p.id = a.project_id
  left join public.domain_ratings r on r.assessment_id = a.id and r.domain_id = d.id
  where coalesce(r.is_complete, false) = false;

  if v_incomplete is not null then
    raise exception 'Complete these domains before submitting: %', array_to_string(v_incomplete, ', ')
      using errcode = 'check_violation';
  end if;

  update public.assessments set status = 'submitted', submitted_at = now() where id = a.id;
  perform public.write_audit('submit', 'assessments', a.id, a.project_id, null, null);
end;
$$;

-- Invariant 5: only the PI reopens, with a reason, and it is audit-logged.
create function public.reopen_assessment(p_assessment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.assessments;
begin
  perform public.require_consented_user();
  select * into a from public.assessments where id = p_assessment for update;
  if a.id is null or not public.has_project_role(a.project_id, array['pi']::project_role[]) then
    raise exception 'Only the PI can reopen an assessment';
  end if;
  if a.status <> 'submitted' then
    raise exception 'Only submitted assessments can be reopened';
  end if;
  if not public.has_text(p_reason) then
    raise exception 'A reason is required to reopen an assessment';
  end if;
  if public.project_status_of(a.project_id) <> 'assessment' then
    raise exception 'Assessments can only be reopened during the assessment stage';
  end if;
  update public.assessments set status = 'reopened', reopened_reason = p_reason where id = a.id;
  perform public.write_audit('reopen', 'assessments', a.id, a.project_id, null,
                             jsonb_build_object('reason', p_reason), array['reopen']);
end;
$$;

-- PLAN D-22: the PI may close the assessment window for an assessor who has not submitted.
create function public.withdraw_assessment(p_assessment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.assessments;
begin
  perform public.require_consented_user();
  select * into a from public.assessments where id = p_assessment for update;
  if a.id is null or not public.has_project_role(a.project_id, array['pi']::project_role[]) then
    raise exception 'Only the PI can withdraw an assessment';
  end if;
  if a.status not in ('draft', 'reopened') then
    raise exception 'Only unsubmitted assessments can be withdrawn';
  end if;
  if not public.has_text(p_reason) then
    raise exception 'A reason is required';
  end if;
  update public.assessments set status = 'withdrawn', withdrawn_reason = p_reason where id = a.id;
  perform public.write_audit('withdraw', 'assessments', a.id, a.project_id, null,
                             jsonb_build_object('reason', p_reason));
end;
$$;

-- Progress without ratings: what the PI and reviewer see before G3 (PLAN D-6).
create function public.assessment_progress(p_project uuid)
returns table (assessment_id uuid, assessor_id uuid, assessor_name text, status assessment_status,
               submitted_at timestamptz, complete_domains int, total_domains int)
language sql stable security definer set search_path = public as $$
  select a.id, a.assessor_id, pr.full_name, a.status, a.submitted_at,
         (select count(*)::int from public.domain_ratings r where r.assessment_id = a.id and r.is_complete),
         (select count(*)::int from public.domain_ratings r where r.assessment_id = a.id)
  from public.assessments a
  join public.profiles pr on pr.id = a.assessor_id
  where a.project_id = p_project and public.can_view_project(p_project)
  order by pr.full_name
$$;

-- Gates ------------------------------------------------------------------------------

create function public.open_gate_review(p_project uuid, p_gate gate_code) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_review uuid;
begin
  select id into v_review from public.gate_reviews
  where project_id = p_project and gate = p_gate and owner_decision is null;
  if v_review is null then
    insert into public.gate_reviews (project_id, gate, attempt_number, created_by)
    values (p_project, p_gate,
            coalesce((select max(attempt_number) from public.gate_reviews where project_id = p_project and gate = p_gate), 0) + 1,
            auth.uid())
    returning id into v_review;
  end if;
  return v_review;
end;
$$;

create function public.refresh_suggestion(p_review uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb := public.suggest_decision(public.review_criteria_json(p_review));
begin
  update public.gate_reviews set
    suggested_decision = (s ->> 'decision')::suggested_decision,
    suggestion_reasons = array(select jsonb_array_elements_text(s -> 'reasons'))
  where id = p_review;
  return s;
end;
$$;

create function public.assert_gate_open(p_project uuid, p_gate gate_code) returns project_status
language plpgsql security definer set search_path = public as $$
declare
  v_status project_status;
begin
  select status into v_status from public.assessment_projects where id = p_project for update;
  if v_status is null then
    raise exception 'Project not found';
  end if;
  if public.gate_for_status(v_status) is distinct from p_gate then
    raise exception 'Gate % is not open; this project is at the % stage (gates are sequential)', p_gate, v_status;
  end if;
  return v_status;
end;
$$;

-- Answers: [{criterion_id, answer, note}]
create function public.save_gate_review(p_project uuid, p_gate gate_code, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_review uuid;
  a jsonb;
begin
  perform public.require_consented_user();
  perform public.assert_gate_open(p_project, p_gate);
  if not public.has_project_role(p_project, array[public.gate_owner_role(p_gate)]) then
    raise exception 'Only the % records gate %', public.gate_owner_role(p_gate), p_gate;
  end if;
  v_review := public.open_gate_review(p_project, p_gate);

  for a in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    if not exists (select 1 from public.gate_criteria gc
                   join public.assessment_projects p on p.framework_version_id = gc.framework_version_id
                   where p.id = p_project and gc.gate = p_gate and gc.id = (a ->> 'criterion_id')::uuid) then
      raise exception 'Criterion % does not belong to gate %', a ->> 'criterion_id', p_gate;
    end if;
    insert into public.gate_criterion_responses as r (gate_review_id, criterion_id, answer, note, created_by)
    values (v_review, (a ->> 'criterion_id')::uuid, (a ->> 'answer')::criterion_answer, a ->> 'note', auth.uid())
    on conflict (gate_review_id, criterion_id) do update
      set note = excluded.note,
          answer = case when r.auto then r.answer else excluded.answer end;
  end loop;

  perform public.refresh_suggestion(v_review);
  return v_review;
end;
$$;

create function public.record_gate_verification(p_project uuid, p_gate gate_code, p_outcome text, p_notes text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_review uuid;
begin
  if p_gate not in ('G2', 'G6') then
    raise exception 'Only G2 and G6 have a reviewer verification step';
  end if;
  perform public.assert_gate_open(p_project, p_gate);
  if not public.has_project_role(p_project, array['reviewer']::project_role[]) then
    raise exception 'Only a reviewer can verify gate %', p_gate;
  end if;
  if p_outcome = 'returned' and not public.has_text(p_notes) then
    raise exception 'Explain what needs to change when returning a gate';
  end if;
  v_review := public.open_gate_review(p_project, p_gate);
  insert into public.gate_verifications (gate_review_id, verified_by, outcome, notes, created_by)
  values (v_review, v_user, p_outcome, p_notes, v_user);
end;
$$;

-- Invariant 7: the owner decides; the system only suggests.
create function public.decide_gate(
  p_project uuid, p_gate gate_code, p_decision gate_decision,
  p_conditions text default null, p_rationale text default null
) returns project_status
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_status project_status;
  v_review uuid;
  v_suggestion jsonb;
  v_suggested text;
  v_override boolean;
  v_next project_status;
  v_line text;
begin
  v_status := public.assert_gate_open(p_project, p_gate);
  if not public.has_project_role(p_project, array[public.gate_owner_role(p_gate)]) then
    raise exception 'Only the % decides gate %', public.gate_owner_role(p_gate), p_gate;
  end if;

  select id into v_review from public.gate_reviews
  where project_id = p_project and gate = p_gate and owner_decision is null;
  if v_review is null then
    raise exception 'Complete the gate review checklist first';
  end if;
  if exists (select 1 from jsonb_array_elements(public.review_criteria_json(v_review)) c where c ->> 'answer' is null) then
    raise exception 'Answer every criterion before recording a decision';
  end if;

  if p_gate in ('G2', 'G6') and coalesce((
       select outcome from public.gate_verifications where gate_review_id = v_review
       order by created_at desc, id desc limit 1), '') <> 'verified' then
    raise exception 'A reviewer must verify gate % before the PI decides', p_gate;
  end if;

  v_suggestion := public.refresh_suggestion(v_review);
  v_suggested := v_suggestion ->> 'decision';

  if p_decision = 'conditional_go' and not public.has_text(p_conditions) then
    raise exception 'List the conditions for a conditional go';
  end if;
  if p_decision in ('hold', 'stop_redirect') and not public.has_text(p_rationale) then
    raise exception 'Record the reason for this decision';
  end if;
  v_override := public.decision_rank(p_decision::text) > public.decision_rank(v_suggested);
  if v_override and not public.has_text(p_rationale) then
    raise exception 'Recording % when the suggestion is % needs a written justification', p_decision, v_suggested;
  end if;

  update public.gate_reviews set
    owner_decision = p_decision, conditions = p_conditions, rationale = p_rationale,
    is_override = v_override, decided_by = v_user, decided_at = now()
  where id = v_review;

  v_next := public.next_status(v_status, p_decision);
  update public.assessment_projects set
    status = v_next,
    closed_reason = case when v_next = 'closed' then coalesce(p_rationale, 'Completed after ' || p_gate) else closed_reason end
  where id = p_project;

  if p_decision = 'conditional_go' then
    for v_line in select btrim(x) from regexp_split_to_table(p_conditions, E'\n') x loop
      if v_line <> '' then
        insert into public.action_items (project_id, description, source_gate_review_id, created_by)
        values (p_project, v_line, v_review, v_user);
      end if;
    end loop;
  end if;

  perform public.write_audit('gate_decision', 'gate_reviews', v_review, p_project, null,
    jsonb_build_object('gate', p_gate, 'decision', p_decision, 'suggested', v_suggested, 'next_status', v_next),
    case when v_override then array['gate_override'] else '{}'::text[] end);
  return v_next;
end;
$$;

-- Advisory mode only (PLAN D-19): the PI advances the stage by hand, with a reason.
create function public.advance_stage(p_project uuid, p_reason text) returns project_status
language plpgsql security definer set search_path = public as $$
declare
  v_status project_status;
  v_next project_status;
begin
  perform public.require_consented_user();
  if public.setting_bool('gate_enforcement', true) then
    raise exception 'Gates are enforced; record a gate decision instead';
  end if;
  if not public.has_project_role(p_project, array['pi']::project_role[]) then
    raise exception 'Only the PI can advance the stage';
  end if;
  if not public.has_text(p_reason) then
    raise exception 'A reason is required';
  end if;
  select status into v_status from public.assessment_projects where id = p_project for update;
  if public.gate_for_status(v_status) is null then
    raise exception 'This project cannot be advanced from %', v_status;
  end if;
  v_next := public.next_status(v_status, 'go');
  update public.assessment_projects set status = v_next,
    closed_reason = case when v_next = 'closed' then p_reason else closed_reason end
  where id = p_project;
  perform public.write_audit('manual_advance', 'assessment_projects', p_project, p_project,
    jsonb_build_object('status', v_status), jsonb_build_object('status', v_next, 'reason', p_reason), array['manual_advance']);
  return v_next;
end;
$$;

-- G8 reassessment: a new cycle of the same subject, linked to this one (brief §6.1).
create function public.start_reassessment(p_project uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  p public.assessment_projects;
  v_framework uuid;
  v_new uuid;
begin
  select * into p from public.assessment_projects where id = p_project;
  if not public.has_project_role(p_project, array['pi']::project_role[]) then
    raise exception 'Only the PI can start a reassessment';
  end if;
  if p.status <> 'closed' or not public.project_passed(p_project, 'G8') then
    raise exception 'Reassessment starts after G8';
  end if;
  select id into v_framework from public.framework_versions where status = 'published' order by published_at desc limit 1;
  insert into public.assessment_projects (subject_id, institution_id, framework_version_id, status, assessment_type,
                                          previous_project_id, created_by)
  values (p.subject_id, p.institution_id, v_framework, 'scoping', 'reassessment', p.id, v_user)
  returning id into v_new;
  insert into public.project_members (project_id, user_id, role, created_by) values (v_new, v_user, 'pi', v_user);
  return v_new;
end;
$$;

-- Only signed-in users may call RPCs; internal helpers stay private.
do $$
declare f text;
begin
  foreach f in array array[
    'record_consent(boolean, boolean, boolean, text)',
    'project_member_profiles(uuid)',
    'create_project(subject_type, text, text, text, text, assessment_type, uuid)',
    'start_scoping(uuid)', 'start_assessment(uuid)', 'submit_assessment(uuid)',
    'reopen_assessment(uuid, text)', 'withdraw_assessment(uuid, text)', 'assessment_progress(uuid)',
    'save_gate_review(uuid, gate_code, jsonb)', 'record_gate_verification(uuid, gate_code, text, text)',
    'decide_gate(uuid, gate_code, gate_decision, text, text)', 'advance_stage(uuid, text)',
    'start_reassessment(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'write_audit(text, text, uuid, uuid, jsonb, jsonb, text[])', 'open_gate_review(uuid, gate_code)',
    'refresh_suggestion(uuid)', 'assert_gate_open(uuid, gate_code)', 'review_criteria_json(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end;
$$;
