-- Row-level security (brief §7, §12; PLAN §3.3). Default deny everywhere.
-- Workflow state (project status, gate decisions, assessment status) is never
-- writable directly: it changes only through the RPCs in the next migration.

-- Helpers (security definer so they can read membership without recursion) ----

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'platform_admin')
$$;

create function public.is_institution_admin(p_institution uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_institution is not null and exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role = 'institution_admin' and institution_id = p_institution)
$$;

create function public.has_consented() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid()
                 and consent_processing_at is not null and consent_handling_at is not null and deleted_at is null)
$$;

create function public.has_project_role(p_project uuid, p_roles project_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.project_members
    where project_id = p_project and user_id = auth.uid() and role = any (p_roles))
$$;

create function public.is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.project_members where project_id = p_project and user_id = auth.uid())
$$;

create function public.project_institution(p_project uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select institution_id from public.assessment_projects where id = p_project
$$;

create function public.project_status_of(p_project uuid) returns project_status
language sql stable security definer set search_path = public as $$
  select status from public.assessment_projects where id = p_project
$$;

create function public.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_member(p_project)
      or public.is_institution_admin(public.project_institution(p_project))
$$;

-- Project manager = PI, or institution admin of the owning institution (brief §7).
create function public.can_manage_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_project_role(p_project, array['pi']::project_role[])
      or public.is_institution_admin(public.project_institution(p_project))
$$;

create function public.project_passed(p_project uuid, p_gate gate_code) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gate_reviews
                 where project_id = p_project and gate = p_gate and owner_decision in ('go', 'conditional_go'))
$$;

create function public.project_open(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.project_status_of(p_project) <> 'closed'
$$;

-- Invariant 4: an assessment is visible to its own assessor, and to deliberation
-- roles only once the project has passed G3.
create function public.can_view_assessment(p_assessment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment
      and (a.assessor_id = auth.uid() and public.has_consented()
           or (public.project_passed(a.project_id, 'G3')
               and public.has_project_role(a.project_id,
                     array['pi', 'assessor', 'reviewer', 'external_expert', 'community_participant']::project_role[]))))
$$;

create function public.can_edit_assessment(p_assessment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment and a.assessor_id = auth.uid() and a.status in ('draft', 'reopened')
      and public.has_project_role(a.project_id, array['assessor']::project_role[])
      and public.project_status_of(a.project_id) = 'assessment')
$$;

-- Evidence confidentiality (PLAN §3.3)
create function public.can_view_evidence(p_project uuid, p_level confidentiality, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_level
    when 'public' then public.can_view_project(p_project)
    when 'restricted' then public.is_project_member(p_project)
    when 'confidential' then public.has_project_role(p_project, array['pi', 'assessor', 'reviewer']::project_role[])
    when 'highly_confidential' then public.has_project_role(p_project, array['pi']::project_role[])
                                    or (p_owner = auth.uid() and public.is_project_member(p_project))
  end
$$;

-- Deliberation roles see post-G3 material.
create function public.can_deliberate(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.project_passed(p_project, 'G3')
     and public.has_project_role(p_project,
           array['pi', 'assessor', 'reviewer', 'external_expert', 'community_participant']::project_role[])
$$;

-- Profile and report access: core team always; observers and community after G6 (brief §7).
create function public.can_view_profile_outputs(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_project_role(p_project, array['pi', 'assessor', 'reviewer', 'external_expert', 'kt_lead']::project_role[])
      or public.is_institution_admin(public.project_institution(p_project))
      or (public.project_passed(p_project, 'G6')
          and public.has_project_role(p_project, array['observer', 'community_participant']::project_role[]))
$$;

-- Default deny: enable RLS everywhere, remove anonymous access -----------------

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end;
$$;

-- Framework configuration: readable by everyone signed in; admins edit drafts.
do $$
declare t text;
begin
  foreach t in array array['framework_versions', 'dimensions', 'domains', 'indicators', 'rating_levels',
                           'signal_definitions', 'gate_criteria'] loop
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
    execute format('create policy admin_write on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())', t);
  end loop;
end;
$$;

create policy read_all on public.settings for select to authenticated using (true);
create policy admin_write on public.settings for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy read_all on public.institutions for select to authenticated using (true);
create policy admin_write on public.institutions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Profiles: you see yourself; admins see their scope. Team names come from
-- project_member_profiles() so emails are not exposed to every co-member.
create policy own_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin() or public.is_institution_admin(institution_id));
create policy update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, institution_name, position, country, discipline, orcid) on public.profiles to authenticated;

-- Subjects and projects (creation only through create_project()).
create policy viewers on public.subjects for select to authenticated
  using (exists (select 1 from public.assessment_projects p where p.subject_id = subjects.id and public.can_view_project(p.id)));
create policy managers on public.subjects for update to authenticated
  using (exists (select 1 from public.assessment_projects p where p.subject_id = subjects.id
                 and p.status <> 'closed' and public.can_manage_project(p.id)));
revoke insert, delete on public.subjects from authenticated;

create policy viewers on public.assessment_projects for select to authenticated using (public.can_view_project(id));
create policy managers on public.assessment_projects for update to authenticated
  using (status <> 'closed' and public.can_manage_project(id));
revoke insert, update, delete on public.assessment_projects from authenticated;
grant update (single_assessor, assessment_type) on public.assessment_projects to authenticated;

create policy viewers on public.project_members for select to authenticated using (public.can_view_project(project_id));
create policy declare_own_coi on public.project_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.project_members from authenticated;
grant update (coi_declared_at, coi_statement) on public.project_members to authenticated;

create policy managers on public.invitations for select to authenticated using (public.can_manage_project(project_id));
revoke insert, update, delete on public.invitations from authenticated;

-- T1/T2: PI or institution admin edits; everyone on the project reads (PLAN D-11).
create policy viewers on public.decision_records for select to authenticated using (public.can_view_project(project_id));
create policy managers on public.decision_records for all to authenticated
  using (public.can_manage_project(project_id) and public.project_status_of(project_id) in ('draft', 'scoping'))
  with check (public.can_manage_project(project_id) and public.project_status_of(project_id) in ('draft', 'scoping'));

do $$
declare t text;
begin
  foreach t in array array['context_profiles', 'actors'] loop
    execute format('create policy viewers on public.%I for select to authenticated using (public.can_view_project(project_id))', t);
    execute format($p$create policy managers on public.%I for all to authenticated
      using (public.can_manage_project(project_id) and public.project_status_of(project_id) in ('draft', 'scoping', 'context'))
      with check (public.can_manage_project(project_id) and public.project_status_of(project_id) in ('draft', 'scoping', 'context'))$p$, t);
  end loop;
end;
$$;

-- T5 evidence: PI and assessors upload; visibility follows confidentiality.
create policy viewers on public.evidence_items for select to authenticated
  using (public.can_view_evidence(project_id, confidentiality, created_by));
create policy uploaders_insert on public.evidence_items for insert to authenticated
  with check (public.has_project_role(project_id, array['pi', 'assessor']::project_role[]) and public.project_open(project_id));
create policy uploaders_edit on public.evidence_items for update to authenticated
  using ((created_by = auth.uid() or public.has_project_role(project_id, array['pi']::project_role[]))
         and public.has_project_role(project_id, array['pi', 'assessor']::project_role[]) and public.project_open(project_id));
create policy uploaders_delete on public.evidence_items for delete to authenticated
  using ((created_by = auth.uid() or public.has_project_role(project_id, array['pi']::project_role[]))
         and public.has_project_role(project_id, array['pi', 'assessor']::project_role[]) and public.project_open(project_id));

create policy viewers on public.evidence_domain_links for select to authenticated
  using (exists (select 1 from public.evidence_items e where e.id = evidence_id
                 and public.can_view_evidence(e.project_id, e.confidentiality, e.created_by)));
create policy uploaders on public.evidence_domain_links for all to authenticated
  using (exists (select 1 from public.evidence_items e where e.id = evidence_id
                 and public.has_project_role(e.project_id, array['pi', 'assessor']::project_role[]) and public.project_open(e.project_id)))
  with check (exists (select 1 from public.evidence_items e where e.id = evidence_id
                 and public.has_project_role(e.project_id, array['pi', 'assessor']::project_role[]) and public.project_open(e.project_id)));

create policy viewers on public.evidence_gaps for select to authenticated using (public.is_project_member(project_id));
create policy uploaders on public.evidence_gaps for all to authenticated
  using (public.has_project_role(project_id, array['pi', 'assessor']::project_role[]) and public.project_open(project_id))
  with check (public.has_project_role(project_id, array['pi', 'assessor']::project_role[]) and public.project_open(project_id));

-- T3 assessments (invariant 4). Rows are created by start_assessment(); status
-- changes go through submit/reopen/withdraw RPCs.
create policy viewers on public.assessments for select to authenticated using (public.can_view_assessment(id));
revoke insert, update, delete on public.assessments from authenticated;

create policy viewers on public.domain_ratings for select to authenticated using (public.can_view_assessment(assessment_id));
create policy own_edit on public.domain_ratings for update to authenticated
  using (public.can_edit_assessment(assessment_id)) with check (public.can_edit_assessment(assessment_id));
revoke insert, delete on public.domain_ratings from authenticated;
revoke update on public.domain_ratings from authenticated;
grant update (rating, narrative, confidence, is_complete) on public.domain_ratings to authenticated;

create policy viewers on public.indicator_responses for select to authenticated using (public.can_view_assessment(assessment_id));
create policy own_edit on public.indicator_responses for all to authenticated
  using (public.can_edit_assessment(assessment_id)) with check (public.can_edit_assessment(assessment_id));

do $$
declare t text;
begin
  foreach t in array array['rating_evidence_links', 'rating_gap_links'] loop
    execute format($p$create policy viewers on public.%I for select to authenticated
      using (exists (select 1 from public.domain_ratings r where r.id = domain_rating_id and public.can_view_assessment(r.assessment_id)))$p$, t);
    execute format($p$create policy own_edit on public.%I for all to authenticated
      using (exists (select 1 from public.domain_ratings r where r.id = domain_rating_id and public.can_edit_assessment(r.assessment_id)))
      with check (exists (select 1 from public.domain_ratings r where r.id = domain_rating_id and public.can_edit_assessment(r.assessment_id)))$p$, t);
  end loop;
end;
$$;

-- T4 integrity (PLAN D-7)
create policy viewers on public.integrity_reviews for select to authenticated
  using (case scope when 'assessor' then public.can_view_assessment(assessment_id)
                    else public.project_passed(project_id, 'G3') and public.is_project_member(project_id) end);
create policy assessor_own on public.integrity_reviews for all to authenticated
  using (scope = 'assessor' and public.can_edit_assessment(assessment_id))
  with check (scope = 'assessor' and public.can_edit_assessment(assessment_id));
create policy project_team on public.integrity_reviews for all to authenticated
  using (scope = 'project' and public.project_status_of(project_id) = 'integrity'
         and public.has_project_role(project_id, array['pi', 'assessor', 'reviewer']::project_role[]))
  with check (scope = 'project' and public.project_status_of(project_id) = 'integrity'
         and public.has_project_role(project_id, array['pi', 'assessor', 'reviewer']::project_role[]));

create policy viewers on public.integrity_flags for select to authenticated
  using (exists (select 1 from public.integrity_reviews r where r.id = integrity_review_id));
create policy editors on public.integrity_flags for all to authenticated
  using (exists (select 1 from public.integrity_reviews r where r.id = integrity_review_id
                 and ((r.scope = 'assessor' and public.can_edit_assessment(r.assessment_id))
                      or (r.scope = 'project' and public.project_status_of(r.project_id) = 'integrity'
                          and public.has_project_role(r.project_id, array['pi', 'assessor', 'reviewer']::project_role[])))))
  with check (exists (select 1 from public.integrity_reviews r where r.id = integrity_review_id
                 and ((r.scope = 'assessor' and public.can_edit_assessment(r.assessment_id))
                      or (r.scope = 'project' and public.project_status_of(r.project_id) = 'integrity'
                          and public.has_project_role(r.project_id, array['pi', 'assessor', 'reviewer']::project_role[])))));

-- T6 deliberation (after G3)
create policy viewers on public.deliberation_sessions for select to authenticated using (public.can_deliberate(project_id));
create policy pi_write on public.deliberation_sessions for all to authenticated
  using (public.has_project_role(project_id, array['pi']::project_role[]) and public.project_status_of(project_id) = 'deliberation')
  with check (public.has_project_role(project_id, array['pi']::project_role[]) and public.project_status_of(project_id) = 'deliberation');

create policy viewers on public.deliberation_participants for select to authenticated
  using (exists (select 1 from public.deliberation_sessions s where s.id = session_id and public.can_deliberate(s.project_id)));
create policy pi_write on public.deliberation_participants for all to authenticated
  using (exists (select 1 from public.deliberation_sessions s where s.id = session_id
                 and public.has_project_role(s.project_id, array['pi']::project_role[])))
  with check (exists (select 1 from public.deliberation_sessions s where s.id = session_id
                 and public.has_project_role(s.project_id, array['pi']::project_role[])));

create policy viewers on public.domain_discussions for select to authenticated using (public.can_deliberate(project_id));
create policy participants_add on public.domain_discussions for insert to authenticated
  with check (created_by = auth.uid() and public.can_deliberate(project_id) and public.project_status_of(project_id) = 'deliberation');

create policy viewers on public.consensus_ratings for select to authenticated
  using (public.can_deliberate(project_id) or (public.can_view_profile_outputs(project_id) and pi_approved_at is not null));
create policy pi_write on public.consensus_ratings for all to authenticated
  using (public.has_project_role(project_id, array['pi']::project_role[]) and public.project_status_of(project_id) = 'deliberation')
  with check (public.has_project_role(project_id, array['pi']::project_role[]) and public.project_status_of(project_id) = 'deliberation');
revoke update on public.consensus_ratings from authenticated;
grant update (rating, category, rationale, confidence) on public.consensus_ratings to authenticated;

-- Invariant 6: dissent is append-only for members; nobody deletes it.
create policy viewers on public.dissent_records for select to authenticated using (public.can_deliberate(project_id));
create policy record_own on public.dissent_records for insert to authenticated
  with check (public.can_deliberate(project_id) and public.project_status_of(project_id) = 'deliberation'
              and (member_id = auth.uid() or public.has_project_role(project_id, array['pi']::project_role[])));
revoke update, delete on public.dissent_records from authenticated;

-- T8 / G6
create policy viewers on public.member_checks for select to authenticated using (public.can_view_profile_outputs(project_id));
create policy editors on public.member_checks for all to authenticated
  using (public.has_project_role(project_id, array['pi', 'reviewer']::project_role[]) and public.project_open(project_id))
  with check (public.has_project_role(project_id, array['pi', 'reviewer']::project_role[]) and public.project_open(project_id));

create policy viewers on public.report_drafts for select to authenticated using (public.can_view_profile_outputs(project_id));
create policy editors on public.report_drafts for all to authenticated
  using (public.has_project_role(project_id, array['pi', 'reviewer']::project_role[]) and approved_at is null)
  with check (public.has_project_role(project_id, array['pi', 'reviewer']::project_role[]) and approved_at is null);
revoke update on public.report_drafts from authenticated;
grant update (body) on public.report_drafts to authenticated;

create policy own_insert on public.report_downloads for insert to authenticated
  with check (created_by = auth.uid() and public.can_view_profile_outputs(project_id));
create policy managers on public.report_downloads for select to authenticated using (public.can_manage_project(project_id));

-- T9 / T10 / T7
do $$
declare t text;
begin
  foreach t in array array['kt_products', 'uptake_events', 'follow_up_reviews', 'action_items'] loop
    execute format('create policy viewers on public.%I for select to authenticated using (public.is_project_member(project_id))', t);
    execute format($p$create policy editors on public.%I for all to authenticated
      using (public.has_project_role(project_id, array['pi', 'kt_lead']::project_role[]) and public.project_open(project_id))
      with check (public.has_project_role(project_id, array['pi', 'kt_lead']::project_role[]) and public.project_open(project_id))$p$, t);
  end loop;
end;
$$;

create policy viewers on public.framework_lessons for select to authenticated
  using (public.is_platform_admin() or (project_id is not null and public.is_project_member(project_id)));
create policy pi_add on public.framework_lessons for insert to authenticated
  with check (project_id is not null and public.has_project_role(project_id, array['pi']::project_role[]));

create policy viewers on public.signal_observations for select to authenticated
  using (exists (select 1 from public.assessment_projects p where p.subject_id = signal_observations.subject_id
                 and public.is_project_member(p.id)));
create policy editors on public.signal_observations for all to authenticated
  using (project_id is not null and public.has_project_role(project_id, array['pi', 'assessor', 'kt_lead']::project_role[]))
  with check (project_id is not null and public.has_project_role(project_id, array['pi', 'assessor', 'kt_lead']::project_role[]));

-- Gates: readable by the team; written only through gate RPCs.
create policy viewers on public.gate_reviews for select to authenticated using (public.can_view_project(project_id));
create policy viewers on public.gate_criterion_responses for select to authenticated
  using (exists (select 1 from public.gate_reviews g where g.id = gate_review_id and public.can_view_project(g.project_id)));
create policy viewers on public.gate_verifications for select to authenticated
  using (exists (select 1 from public.gate_reviews g where g.id = gate_review_id and public.can_view_project(g.project_id)));
revoke insert, update, delete on public.gate_reviews, public.gate_criterion_responses, public.gate_verifications from authenticated;

-- Audit log: platform admins see everything, PIs their own project's trail. Nobody writes.
create policy readers on public.audit_log for select to authenticated
  using (public.is_platform_admin() or (project_id is not null and public.has_project_role(project_id, array['pi']::project_role[])));

-- Notifications: recipient only.
create policy recipient on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy recipient_mark_read on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
