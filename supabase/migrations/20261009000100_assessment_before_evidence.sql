-- PLAN D-52 (decided by Paul, 2026-10-07): independent assessment comes BEFORE the evidence
-- review. New order:
--   scoping (G0) → context (G1) → assessment (G2) → evidence review (G3) → integrity (G4) → …
-- "You cannot proceed without evidence" is kept twice over:
--   • invariant 3 — no rating can be marked complete without linked evidence or a documented gap;
--   • the evidence-review gate (now G3, reviewer-verified) must pass before integrity.
-- Assessor independence (invariant 4) now ends at the assessment gate, G2.

-- Status ↔ gate mapping (mirrored in src/domain/workflow.ts) ------------------------
create or replace function public.gate_for_status(p_status project_status) returns gate_code
language sql immutable as $$
  select case p_status
    when 'scoping' then 'G0' when 'context' then 'G1' when 'assessment' then 'G2'
    when 'evidence' then 'G3' when 'integrity' then 'G4' when 'deliberation' then 'G5'
    when 'validation' then 'G6' when 'uptake' then 'G7' when 'learning' then 'G8'
  end::gate_code
$$;

create or replace function public.next_status(p_status project_status, p_decision gate_decision) returns project_status
language sql immutable as $$
  select case
    when p_decision = 'stop_redirect' then 'closed'::project_status
    when p_decision = 'hold' then p_status
    else case p_status
      when 'scoping' then 'context' when 'context' then 'assessment' when 'assessment' then 'evidence'
      when 'evidence' then 'integrity' when 'integrity' then 'deliberation'
      when 'deliberation' then 'validation' when 'validation' then 'uptake'
      when 'uptake' then 'learning' when 'learning' then 'closed'
    end::project_status
  end
$$;

-- Gates the reviewer verifies before the PI decides: the evidence review and validation.
create function public.gate_needs_verification(p_gate gate_code) returns boolean
language sql immutable as $$
  select p_gate in ('G3', 'G6')
$$;

create or replace function public.record_gate_verification(p_project uuid, p_gate gate_code, p_outcome text, p_notes text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_review uuid;
begin
  if not public.gate_needs_verification(p_gate) then
    raise exception 'Only the evidence review (G3) and validation (G6) have a reviewer verification step';
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

-- Same as before except the verification check uses gate_needs_verification().
create or replace function public.decide_gate(
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

  if public.gate_needs_verification(p_gate) and coalesce((
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

-- Invariant 4: independence now ends when the assessment gate (G2) is passed ----------
create or replace function public.can_view_assessment(p_assessment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment
      and (a.assessor_id = auth.uid() and public.has_consented()
           or (public.project_passed(a.project_id, 'G2')
               and public.has_project_role(a.project_id,
                     array['pi', 'assessor', 'reviewer', 'external_expert', 'community_participant']::project_role[]))))
$$;

create or replace function public.can_deliberate(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.project_passed(p_project, 'G2')
     and public.has_project_role(p_project,
           array['pi', 'assessor', 'reviewer', 'external_expert', 'community_participant']::project_role[])
$$;

drop policy viewers on public.integrity_reviews;
create policy viewers on public.integrity_reviews for select to authenticated
  using (case scope when 'assessor' then public.can_view_assessment(assessment_id)
                    else public.project_passed(project_id, 'G2') and public.is_project_member(project_id) end);

-- Gate criteria: the assessment criteria become G2 and the evidence criteria G3 ----------
-- A deliberate, one-time correction of framework v1 (invariant 9 normally forbids editing a
-- published version). It is safe only because no project has yet had a G2 or G3 review, so
-- no past decision changes meaning. The guard below refuses to run otherwise.
do $$
begin
  if exists (select 1 from public.gate_reviews where gate in ('G2', 'G3')) then
    raise exception 'Gate reviews already exist at G2/G3: publish a new framework version instead of swapping v1';
  end if;
  alter table public.gate_criteria disable trigger guard_framework_content;
  -- Swap via temporary sort numbers to respect unique (version, gate, sort). The advisory
  -- "conditions from previous gate resolved" criterion (sort 99) stays on each gate.
  update public.gate_criteria set gate = 'G3', sort = sort + 100 where gate = 'G2' and sort < 99;
  update public.gate_criteria set gate = 'G2' where gate = 'G3' and sort < 99;
  update public.gate_criteria set sort = sort - 100 where gate = 'G3' and sort > 100;
  alter table public.gate_criteria enable trigger guard_framework_content;
end;
$$;

do $$
declare s regprocedure;
begin
  foreach s in array array['public.record_gate_verification(uuid,gate_code,text,text)'::regprocedure,
                           'public.decide_gate(uuid,gate_code,gate_decision,text,text)'::regprocedure] loop
    execute format('revoke execute on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end;
$$;
