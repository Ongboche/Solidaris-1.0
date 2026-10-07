-- Phase 6: KT & uptake (T9, G7), anticipatory signals (T7), learning & reassessment (T10, G8).
-- These components are proposals pending the research team's review (brief §16.4): the UI
-- keeps them behind feature flags.

-- The decision-maker's response to the profile (G7 "action plan or documented no-action").
-- Schema addition recorded as PLAN D-48.
create table public.decision_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null unique references public.assessment_projects (id),
  response_type text not null check (response_type in ('action_plan', 'no_action')),
  summary text,
  follow_up_on date,
  check (response_type <> 'no_action' or has_text(summary))
);

alter table public.decision_responses enable row level security;
revoke all on public.decision_responses from anon;
create trigger set_updated_at before update on public.decision_responses for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.decision_responses for each row execute function public.audit_row();

create policy viewers on public.decision_responses for select to authenticated using (public.is_project_member(project_id));
create policy editors on public.decision_responses for all to authenticated
  using (public.has_project_role(project_id, array['pi', 'kt_lead']::project_role[]) and public.project_open(project_id))
  with check (public.has_project_role(project_id, array['pi', 'kt_lead']::project_role[]) and public.project_open(project_id));

-- Action owners can update the status of their own actions (reminders show in "What to do next").
create policy owner_updates_status on public.action_items for update to authenticated
  using (owner_id = auth.uid() and public.is_project_member(project_id))
  with check (owner_id = auth.uid() and public.is_project_member(project_id));

-- Reassessment links the follow-up review to the new cycle (brief §6.1).
create or replace function public.start_reassessment(p_project uuid) returns uuid
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
  if exists (select 1 from public.assessment_projects where previous_project_id = p_project) then
    raise exception 'A reassessment of this project already exists';
  end if;
  select id into v_framework from public.framework_versions where status = 'published' order by published_at desc limit 1;
  insert into public.assessment_projects (subject_id, institution_id, framework_version_id, status, assessment_type,
                                          previous_project_id, created_by)
  values (p.subject_id, p.institution_id, v_framework, 'scoping', 'reassessment', p.id, v_user)
  returning id into v_new;
  insert into public.project_members (project_id, user_id, role, created_by) values (v_new, v_user, 'pi', v_user);
  update public.follow_up_reviews set next_project_id = v_new
  where project_id = p_project and reassessment_decision = 'reassess';
  perform public.write_audit('start_reassessment', 'assessment_projects', v_new, p_project, null,
                             jsonb_build_object('previous_project_id', p_project));
  return v_new;
end;
$$;

-- G7 ------------------------------------------------------------------------------

create function public.auto_check_kt_product_logged(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) filter (where has_text(delivered_to) and delivered_on is not null) > 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('kt_products', count(*),
                                   'delivered', count(*) filter (where has_text(delivered_to) and delivered_on is not null)))
  from public.kt_products where project_id = p_project
$$;

create function public.auto_check_response_recorded(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case
      when r.response_type = 'no_action' then 'yes'
      when r.response_type = 'action_plan' and a.n > 0 then 'yes'
      else 'no' end,
    'evidence', jsonb_build_object('response', r.response_type, 'actions', a.n))
  from (select 1) x
  left join public.decision_responses r on r.project_id = p_project
  cross join lateral (select count(*) as n from public.action_items
                      where project_id = p_project and source_gate_review_id is null and status <> 'cancelled') a
$$;

create function public.auto_check_follow_up_date_set(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when r.follow_up_on is not null then 'yes' else 'no' end,
    'evidence', jsonb_build_object('follow_up_on', r.follow_up_on))
  from (select 1) x left join public.decision_responses r on r.project_id = p_project
$$;

-- G8 ------------------------------------------------------------------------------

create function public.auto_check_follow_up_review_done(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('answer', case when count(*) > 0 then 'yes' else 'no' end,
                            'evidence', jsonb_build_object('follow_up_reviews', count(*)))
  from public.follow_up_reviews where project_id = p_project
$$;

-- Invariant 10: signals are observations to review, never a computed risk.
create function public.auto_check_signals_reviewed(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) filter (where o.reviewed_at is null) = 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('signals', count(*), 'unreviewed', count(*) filter (where o.reviewed_at is null)))
  from public.assessment_projects p
  join public.signal_observations o on o.subject_id = p.subject_id and o.observed_on >= p.created_at::date
  where p.id = p_project
$$;

create function public.auto_check_reassessment_decision(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answer', case when count(*) filter (where reassessment_decision is not null) > 0 then 'yes' else 'no' end,
    'evidence', jsonb_build_object('decision', max(reassessment_decision)))
  from public.follow_up_reviews where project_id = p_project
$$;

create function public.auto_check_lessons_logged(p_project uuid, p_gate gate_code) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('answer', case when count(*) > 0 then 'yes' else 'no' end,
                            'evidence', jsonb_build_object('lessons', count(*)))
  from public.framework_lessons where project_id = p_project
$$;

-- PLAN D-45: the evidence bucket enforces the same 25 MB limit as the upload form.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets set file_size_limit = 26214400 where id = 'evidence';
  end if;
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'auto\_check\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;
