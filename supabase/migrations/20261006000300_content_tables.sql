-- Subjects, projects and every workflow table (brief §5, PLAN §3.2).
-- Every table carries id, created_at, created_by, updated_at.

-- T1/T2 ---------------------------------------------------------------------

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  type subject_type not null,
  name text not null check (has_text(name)),
  country text,
  region text,
  description text,
  parent_subject_id uuid references public.subjects (id),
  institution_id uuid references public.institutions (id)
);

create table public.assessment_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  subject_id uuid not null references public.subjects (id),
  institution_id uuid references public.institutions (id),
  framework_version_id uuid not null references public.framework_versions (id),
  status project_status not null default 'draft',
  assessment_type assessment_type not null default 'baseline',
  previous_project_id uuid references public.assessment_projects (id),
  single_assessor boolean not null default false,
  closed_reason text,
  legacy_import boolean not null default false,
  check (status <> 'closed' or has_text(closed_reason))
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  user_id uuid not null references auth.users (id),
  role project_role not null,
  coi_declared_at timestamptz,
  coi_statement text,
  invited_by uuid references auth.users (id),
  unique (project_id, user_id, role)
);

-- Exactly one PI per project: at most one here, at least one via create_project + PI-protection trigger.
create unique index project_members_one_pi on public.project_members (project_id) where role = 'pi';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  email text not null,
  role project_role not null check (role <> 'pi'),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id)
);

create table public.decision_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null unique references public.assessment_projects (id),
  decision_text text,
  decision_maker_name text,
  decision_maker_institution text,
  window_start date,
  window_end date,
  hr_screen_result text check (hr_screen_result in ('pass', 'escalate')),
  hr_screen_note text,
  check (window_end is null or window_start is null or window_end >= window_start)
);

create table public.context_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null unique references public.assessment_projects (id),
  financing text,
  governance text,
  target_population text,
  community_voice_plan text
);

create table public.actors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  category actor_category not null,
  name text not null check (has_text(name)),
  role text,
  influence risk_level,
  participation_level text
);

-- T5 evidence ---------------------------------------------------------------

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  title text not null check (has_text(title)),
  type evidence_type not null,
  source text,
  source_type evidence_source,
  evidence_date date,
  storage_path text,
  url text,
  description text,
  confidentiality confidentiality not null default 'restricted',
  origin evidence_origin not null,
  check (num_nonnulls(storage_path, url) = 1)
);

create table public.evidence_domain_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  evidence_id uuid not null references public.evidence_items (id) on delete cascade,
  domain_id uuid not null references public.domains (id),
  unique (evidence_id, domain_id)
);

create table public.evidence_gaps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  domain_id uuid not null references public.domains (id),
  description text not null check (has_text(description)),
  effect_on_confidence text
);

-- T3 independent assessment ------------------------------------------------

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  assessor_id uuid not null references auth.users (id),
  status assessment_status not null default 'draft',
  submitted_at timestamptz,
  reopened_reason text,
  withdrawn_reason text,
  legacy_import boolean not null default false,
  unique (project_id, assessor_id),
  check (status <> 'submitted' or submitted_at is not null),
  check (status <> 'withdrawn' or has_text(withdrawn_reason))
);

create table public.indicator_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  assessment_id uuid not null references public.assessments (id),
  indicator_id uuid not null references public.indicators (id),
  response text,
  unique (assessment_id, indicator_id)
);

create table public.domain_ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  assessment_id uuid not null references public.assessments (id),
  domain_id uuid not null references public.domains (id),
  -- Invariant 2: NULL = not rated; there is no 0.
  rating smallint check (rating between 1 and 5),
  narrative text,
  confidence confidence_level,
  is_complete boolean not null default false,
  unique (assessment_id, domain_id)
);

create table public.rating_evidence_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  domain_rating_id uuid not null references public.domain_ratings (id),
  evidence_id uuid not null references public.evidence_items (id),
  unique (domain_rating_id, evidence_id)
);

create table public.rating_gap_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  domain_rating_id uuid not null references public.domain_ratings (id),
  gap_id uuid not null references public.evidence_gaps (id),
  unique (domain_rating_id, gap_id)
);

-- T4 integrity (PLAN D-7: per assessor, then one consolidated per project) --

create table public.integrity_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  scope integrity_scope not null,
  assessment_id uuid references public.assessments (id),
  alignment_goal_contradictions text,
  alignment_funder_portfolio text,
  alignment_values_vs_allocation text,
  cost_who_bears text,
  cost_transaction_proportionate text,
  cost_shifted_to_local text,
  cost_indirect_covered text,
  voice_actual_involvement text,
  voice_veto_power text,
  voice_grievance_mechanisms text,
  voice_input_led_to_change text,
  primary_type solidarity_type,
  secondary_type solidarity_type,
  type_evidence text,
  qa_by uuid references auth.users (id),
  qa_at timestamptz,
  qa_notes text,
  check ((scope = 'assessor') = (assessment_id is not null))
);
create unique index integrity_reviews_one_per_assessment on public.integrity_reviews (assessment_id) where scope = 'assessor';
create unique index integrity_reviews_one_per_project on public.integrity_reviews (project_id) where scope = 'project';

create table public.integrity_flags (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  integrity_review_id uuid not null references public.integrity_reviews (id),
  flag risk_flag not null,
  level risk_level not null,
  explanation text,
  unique (integrity_review_id, flag),
  check (level <> 'high' or has_text(explanation))
);

-- T6 deliberation ----------------------------------------------------------

create table public.deliberation_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  held_on date not null,
  notes text
);

create table public.deliberation_participants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  session_id uuid not null references public.deliberation_sessions (id),
  user_id uuid references auth.users (id),
  external_name text,
  role text,
  check (num_nonnulls(user_id, external_name) >= 1)
);

create table public.domain_discussions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  domain_id uuid not null references public.domains (id),
  note text not null check (has_text(note))
);

-- Invariant 6: consensus lives apart from domain_ratings and never writes to it.
create table public.consensus_ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  domain_id uuid not null references public.domains (id),
  rating smallint check (rating between 1 and 5),
  category consensus_category not null,
  rationale text,
  confidence confidence_level,
  reviewer_verified_by uuid references auth.users (id),
  reviewer_verified_at timestamptz,
  pi_approved_by uuid references auth.users (id),
  pi_approved_at timestamptz,
  unique (project_id, domain_id),
  check ((category in ('no_consensus', 'deferred_pending_evidence')) = (rating is null))
);

create table public.dissent_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  domain_id uuid not null references public.domains (id),
  member_id uuid not null references auth.users (id),
  position text not null check (has_text(position)),
  rationale text not null check (has_text(rationale))
);

-- T8 / G6 -------------------------------------------------------------------

create table public.member_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  stakeholder_group text not null check (has_text(stakeholder_group)),
  response text,
  relevance smallint check (relevance between 1 and 5),
  checked_on date
);

-- Invariant 11: every draft records how it was produced and stays a draft until approved.
create table public.report_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  body text not null,
  produced_by draft_origin not null,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  check ((approved_by is null) = (approved_at is null))
);

create table public.report_downloads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  format text not null check (format in ('pdf', 'docx', 'csv'))
);

-- T9 / T10 / T7 (behind feature flags in the UI) ----------------------------

create table public.kt_products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  audience text,
  format text,
  delivered_to text,
  delivered_on date
);

create table public.uptake_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  event_date date not null,
  decision_body text,
  use_type use_type not null,
  evidence_link text
);

create table public.follow_up_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  reviewed_on date not null,
  notes text,
  reassessment_decision text check (reassessment_decision in ('reassess', 'no_reassess')),
  next_project_id uuid references public.assessment_projects (id)
);

create table public.framework_lessons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid references public.assessment_projects (id),
  framework_version_id uuid not null references public.framework_versions (id),
  lesson text not null check (has_text(lesson))
);

-- Invariant 10: observations and levels only, never probabilities.
create table public.signal_observations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  subject_id uuid not null references public.subjects (id),
  project_id uuid references public.assessment_projects (id),
  domain_id uuid not null references public.domains (id),
  observed_on date not null,
  source text,
  description text not null check (has_text(description)),
  level signal_level not null,
  reviewed_at timestamptz
);

-- Gates (§6) ------------------------------------------------------------------

create table public.gate_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  gate gate_code not null,
  attempt_number int not null default 1,
  suggested_decision suggested_decision not null default 'not_started',
  suggestion_reasons text[] not null default '{}',
  owner_decision gate_decision,
  conditions text,
  rationale text,
  is_override boolean not null default false,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  unique (project_id, gate, attempt_number),
  check (owner_decision is distinct from 'conditional_go' or has_text(conditions)),
  check (not is_override or has_text(rationale))
);

create table public.gate_criterion_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  gate_review_id uuid not null references public.gate_reviews (id),
  criterion_id uuid not null references public.gate_criteria (id),
  answer criterion_answer not null,
  note text,
  auto boolean not null default false,
  auto_evidence jsonb,
  unique (gate_review_id, criterion_id),
  check (answer <> 'na' or has_text(note))
);

-- Reviewer step before the PI decides G2 and G6 (PLAN D-12).
create table public.gate_verifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  gate_review_id uuid not null references public.gate_reviews (id),
  verified_by uuid not null references auth.users (id),
  outcome text not null check (outcome in ('verified', 'returned')),
  notes text
);

-- Created from conditional_go conditions (PLAN D-17) and T9 action plans.
create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.assessment_projects (id),
  description text not null check (has_text(description)),
  owner_id uuid references auth.users (id),
  due_on date,
  status action_status not null default 'open',
  source_gate_review_id uuid references public.gate_reviews (id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  recipient_id uuid not null references auth.users (id),
  type text not null,
  project_id uuid references public.assessment_projects (id),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz
);

-- Helpful indexes for RLS lookups
create index on public.project_members (user_id);
create index on public.assessments (assessor_id);
create index on public.domain_ratings (assessment_id);
create index on public.gate_reviews (project_id, gate);
create index on public.evidence_items (project_id);
