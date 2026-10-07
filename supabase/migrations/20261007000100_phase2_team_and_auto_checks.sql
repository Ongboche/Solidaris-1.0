-- Phase 2: invitations, team management and the G0/G1 automatic checks (brief §6.3, §7).

-- Invitations ---------------------------------------------------------------------
-- Roles are granted only by invitation (brief §7). The raw token is returned once to
-- the inviter (to share as a link) and only its SHA-256 hash is stored. An invitation
-- can also be accepted from the invitee's home page when their verified email matches.

create function public.current_user_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

create function public.hash_token(p_token text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

create function public.invite_member(p_project uuid, p_email text, p_role project_role) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_email text := lower(btrim(p_email));
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Only the PI or an institution admin can invite people';
  end if;
  if not public.project_open(p_project) then
    raise exception 'This project is closed';
  end if;
  if p_role = 'pi' then
    raise exception 'A project has exactly one PI; invite people to other roles';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if exists (select 1 from public.project_members m join auth.users u on u.id = m.user_id
             where m.project_id = p_project and m.role = p_role and lower(u.email) = v_email) then
    raise exception 'This person already has that role on the project';
  end if;
  -- Re-inviting replaces any open invitation for the same email and role.
  update public.invitations set expires_at = now()
  where project_id = p_project and email = v_email and role = p_role and accepted_at is null and expires_at > now();

  insert into public.invitations (project_id, email, role, token_hash, expires_at, created_by)
  values (p_project, v_email, p_role, public.hash_token(v_token), now() + interval '30 days', v_user);
  return v_token;
end;
$$;

create function public.accept_invitation_row(p_invitation public.invitations) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_consented_user();
begin
  if p_invitation.id is null then
    raise exception 'This invitation link is not valid';
  end if;
  if p_invitation.accepted_at is not null then
    raise exception 'This invitation has already been used';
  end if;
  if p_invitation.expires_at <= now() then
    raise exception 'This invitation has expired or was withdrawn; ask the PI for a new one';
  end if;
  if p_invitation.email <> public.current_user_email() then
    raise exception 'This invitation was sent to a different email address. Sign in with %', p_invitation.email;
  end if;
  insert into public.project_members (project_id, user_id, role, invited_by, created_by)
  values (p_invitation.project_id, v_user, p_invitation.role, p_invitation.created_by, v_user)
  on conflict (project_id, user_id, role) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = v_user where id = p_invitation.id;
  return p_invitation.project_id;
end;
$$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where token_hash = public.hash_token(btrim(p_token)) for update;
  return public.accept_invitation_row(inv);
end;
$$;

create function public.accept_invitation_by_id(p_invitation uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where id = p_invitation for update;
  return public.accept_invitation_row(inv);
end;
$$;

create function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  perform public.require_consented_user();
  select project_id into v_project from public.invitations where id = p_invitation;
  if v_project is null or not public.can_manage_project(v_project) then
    raise exception 'Only the PI or an institution admin can withdraw invitations';
  end if;
  update public.invitations set expires_at = now() where id = p_invitation and accepted_at is null;
end;
$$;

-- Open invitations addressed to the signed-in user (for "What to do next").
create function public.my_invitations()
returns table (invitation_id uuid, project_id uuid, subject_name text, subject_type subject_type,
               role project_role, invited_by_name text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.project_id, s.name, s.type, i.role, pr.full_name, i.expires_at
  from public.invitations i
  join public.assessment_projects p on p.id = i.project_id
  join public.subjects s on s.id = p.subject_id
  left join public.profiles pr on pr.id = i.created_by
  where i.email = public.current_user_email() and i.accepted_at is null and i.expires_at > now()
    and p.status <> 'closed'
  order by i.created_at
$$;

-- Project details shown on the invite page before accepting (no other data leaks).
create function public.invitation_preview(p_token text)
returns table (subject_name text, subject_type subject_type, role project_role, invited_by_name text,
               email text, expired boolean, accepted boolean)
language sql stable security definer set search_path = public as $$
  select s.name, s.type, i.role, pr.full_name, i.email, i.expires_at <= now(), i.accepted_at is not null
  from public.invitations i
  join public.assessment_projects p on p.id = i.project_id
  join public.subjects s on s.id = p.subject_id
  left join public.profiles pr on pr.id = i.created_by
  where i.token_hash = public.hash_token(btrim(p_token)) and auth.uid() is not null
$$;

-- Team management ----------------------------------------------------------------------

create function public.remove_member(p_membership uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.project_members;
begin
  perform public.require_consented_user();
  select * into m from public.project_members where id = p_membership;
  if m.id is null or not public.can_manage_project(m.project_id) then
    raise exception 'Only the PI or an institution admin can change the team';
  end if;
  if m.role = 'assessor' and exists (select 1 from public.assessments a
       where a.project_id = m.project_id and a.assessor_id = m.user_id) then
    raise exception 'This assessor has started an assessment; withdraw it instead of removing them';
  end if;
  delete from public.project_members where id = p_membership; -- the PI row is protected by trigger
end;
$$;

-- Automatic gate checks (brief §6.3) -----------------------------------------------------
-- Each evaluator returns {"answer": "yes"|"no", "evidence": {...}} or null when the
-- criterion is not automatic yet (its feature arrives in a later phase).

create function public.evaluate_auto_check(p_project uuid, p_gate gate_code, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  missing text[];
  n int;
  undeclared int;
  cats text[];
begin
  case p_key
  when 'subject_type_set' then
    select jsonb_build_object('subject_type', s.type) into v
    from public.assessment_projects p join public.subjects s on s.id = p.subject_id where p.id = p_project;
    return jsonb_build_object('answer', case when v ->> 'subject_type' is not null then 'yes' else 'no' end, 'evidence', v);

  when 'decision_recorded' then
    select array_remove(array[
      case when not has_text(d.decision_text) then 'decision' end,
      case when not has_text(d.decision_maker_name) then 'decision_maker' end,
      case when d.window_start is null or d.window_end is null then 'decision_window' end], null)
    into missing from public.decision_records d where d.project_id = p_project;
    missing := coalesce(missing, array['decision', 'decision_maker', 'decision_window']);
    return jsonb_build_object('answer', case when cardinality(missing) = 0 then 'yes' else 'no' end,
                              'evidence', jsonb_build_object('missing', missing));

  when 'hr_screen_answered' then
    select jsonb_build_object('result', d.hr_screen_result) into v from public.decision_records d where d.project_id = p_project;
    return jsonb_build_object('answer', case when v ->> 'result' is not null then 'yes' else 'no' end,
                              'evidence', coalesce(v, '{}'::jsonb));

  when 'context_complete' then
    select array_remove(array[
      case when not has_text(c.financing) then 'financing' end,
      case when not has_text(c.governance) then 'governance' end,
      case when not has_text(c.target_population) then 'target_population' end], null)
    into missing from public.context_profiles c where c.project_id = p_project;
    missing := coalesce(missing, array['financing', 'governance', 'target_population']);
    return jsonb_build_object('answer', case when cardinality(missing) = 0 then 'yes' else 'no' end,
                              'evidence', jsonb_build_object('missing', missing));

  when 'actor_categories_complete' then
    select array_agg(c::text) into cats
    from unnest(enum_range(null::actor_category)) c
    where not exists (select 1 from public.actors a where a.project_id = p_project and a.category = c);
    cats := coalesce(cats, '{}');
    return jsonb_build_object('answer', case when cardinality(cats) = 0 then 'yes' else 'no' end,
                              'evidence', jsonb_build_object('missing_categories', cats));

  when 'coi_all_assessors' then
    select count(*), count(*) filter (where coi_declared_at is null) into n, undeclared
    from public.project_members where project_id = p_project and role = 'assessor';
    return jsonb_build_object('answer', case when n > 0 and undeclared = 0 then 'yes' else 'no' end,
                              'evidence', jsonb_build_object('assessors', n, 'undeclared', undeclared));

  when 'min_assessors_or_single' then
    select count(*) into n from public.project_members where project_id = p_project and role = 'assessor';
    select jsonb_build_object('assessors', n, 'single_assessor', p.single_assessor) into v
    from public.assessment_projects p where p.id = p_project;
    return jsonb_build_object('answer',
      case when n >= 2 or (n >= 1 and (v ->> 'single_assessor')::boolean) then 'yes' else 'no' end, 'evidence', v);

  when 'community_voice_plan' then
    select jsonb_build_object('documented', has_text(c.community_voice_plan)) into v
    from public.context_profiles c where c.project_id = p_project;
    return jsonb_build_object('answer', case when coalesce((v ->> 'documented')::boolean, false) then 'yes' else 'no' end,
                              'evidence', coalesce(v, jsonb_build_object('documented', false)));

  -- PLAN D-17: conditions recorded at earlier gates are all done or cancelled.
  when 'previous_conditions_resolved' then
    select count(*) into n from public.action_items a
    join public.gate_reviews g on g.id = a.source_gate_review_id
    where a.project_id = p_project and a.status = 'open' and g.gate < p_gate;
    return jsonb_build_object('answer', case when n = 0 then 'yes' else 'no' end,
                              'evidence', jsonb_build_object('open_conditions', n));
  else
    return null;
  end case;
end;
$$;

-- Writes automatic answers onto the open review. Manual notes are kept.
create function public.apply_auto_checks(p_review uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g public.gate_reviews;
  c record;
  r jsonb;
begin
  select * into g from public.gate_reviews where id = p_review;
  perform set_config('app.auto_recompute', 'on', true);
  for c in select gc.id, gc.auto_check_key from public.gate_criteria gc
           join public.assessment_projects p on p.framework_version_id = gc.framework_version_id
           where p.id = g.project_id and gc.gate = g.gate and gc.auto_check_key is not null loop
    r := public.evaluate_auto_check(g.project_id, g.gate, c.auto_check_key);
    if r is not null then
      insert into public.gate_criterion_responses as x (gate_review_id, criterion_id, answer, auto, auto_evidence)
      values (p_review, c.id, (r ->> 'answer')::criterion_answer, true, r -> 'evidence')
      on conflict (gate_review_id, criterion_id) do update
        set answer = excluded.answer, auto = true, auto_evidence = excluded.auto_evidence;
    end if;
  end loop;
  perform set_config('app.auto_recompute', 'off', true);
end;
$$;

-- Opens (or reuses) the review for the current gate, refreshes automatic checks and the
-- suggestion, and returns the review id. Gate owners call it when the screen loads.
create function public.refresh_gate_review(p_project uuid, p_gate gate_code) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_review uuid;
begin
  perform public.require_consented_user();
  perform public.assert_gate_open(p_project, p_gate);
  if not public.can_view_project(p_project) then
    raise exception 'You are not on this project';
  end if;
  v_review := public.open_gate_review(p_project, p_gate);
  perform public.refresh_suggestion(v_review);
  return v_review;
end;
$$;

-- Every suggestion refresh first re-runs the automatic checks, so save_gate_review and
-- decide_gate always work on current data, and an automatic answer always wins over a
-- manual one (brief §6.3: the owner can add notes but never overwrite an automatic "No").
create or replace function public.refresh_suggestion(p_review uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
begin
  perform public.apply_auto_checks(p_review);
  s := public.suggest_decision(public.review_criteria_json(p_review));
  update public.gate_reviews set
    suggested_decision = (s ->> 'decision')::suggested_decision,
    suggestion_reasons = array(select jsonb_array_elements_text(s -> 'reasons'))
  where id = p_review;
  return s;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'invite_member(uuid, text, project_role)', 'accept_invitation(text)', 'accept_invitation_by_id(uuid)',
    'revoke_invitation(uuid)', 'my_invitations()', 'invitation_preview(text)', 'remove_member(uuid)',
    'refresh_gate_review(uuid, gate_code)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'accept_invitation_row(public.invitations)', 'apply_auto_checks(uuid)',
    'evaluate_auto_check(uuid, gate_code, text)', 'current_user_email()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end;
$$;
