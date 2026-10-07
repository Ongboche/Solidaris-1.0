-- SOLIDARIS foundation: enums and shared helpers.
-- Vocabularies follow brief §5 and docs/PLAN.md §3.1.

create type subject_type       as enum ('project', 'programme', 'portfolio', 'investment', 'policy');
create type assessment_type    as enum ('baseline', 'midline', 'endline', 'rapid', 'reassessment');
create type project_status     as enum ('draft', 'scoping', 'context', 'evidence', 'assessment', 'integrity',
                                        'deliberation', 'validation', 'uptake', 'learning', 'closed');
create type project_role       as enum ('pi', 'assessor', 'reviewer', 'observer', 'external_expert',
                                        'kt_lead', 'community_participant');
create type platform_role      as enum ('platform_admin', 'institution_admin', 'member');
-- withdrawn: PI closed the assessment window for this assessor (PLAN D-22)
create type assessment_status  as enum ('draft', 'submitted', 'reopened', 'withdrawn');
create type confidence_level   as enum ('low', 'medium', 'high');
create type risk_level         as enum ('low', 'medium', 'high');
create type risk_flag          as enum ('washing', 'power', 'sustainability', 'inclusion');
create type solidarity_type    as enum ('symbolic', 'instrumental', 'substantive', 'transformative');
create type evidence_type      as enum ('document', 'interview', 'fgd', 'observation', 'admin_data',
                                        'literature', 'financial', 'media', 'other');
create type evidence_origin    as enum ('community', 'government', 'funder', 'implementer', 'independent');
create type evidence_source    as enum ('primary', 'secondary', 'grey_literature', 'peer_reviewed',
                                        'government_document', 'internal_document', 'media', 'website');
create type confidentiality    as enum ('public', 'restricted', 'confidential', 'highly_confidential');
create type consensus_category as enum ('full', 'substantial', 'with_reservations', 'no_consensus',
                                        'deferred_pending_evidence');
create type gate_code          as enum ('G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8');
create type criterion_answer   as enum ('yes', 'partial', 'no', 'na');
create type gate_decision      as enum ('go', 'conditional_go', 'hold', 'stop_redirect');
create type suggested_decision as enum ('not_started', 'hold', 'conditional_go', 'go');
create type use_type           as enum ('instrumental', 'conceptual', 'symbolic');
create type signal_level       as enum ('watch', 'act');
create type framework_status   as enum ('draft', 'published', 'retired');
create type actor_category     as enum ('funder', 'implementer', 'community', 'government');
create type integrity_scope    as enum ('assessor', 'project');
create type draft_origin       as enum ('template', 'llm', 'human');
create type action_status      as enum ('open', 'done', 'cancelled');

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Non-blank text helper used by CHECK constraints.
create function public.has_text(value text) returns boolean
language sql immutable as $$
  select coalesce(length(btrim(value)), 0) > 0
$$;
