-- Framework v1 (brief §8, Appendix A and B). Seeded as draft, then published (invariant 9).
-- Text is copied from the brief; nothing is invented. Key questions and rating
-- descriptors were not supplied and are left empty for the research team.

insert into public.settings (key, value, description) values
  ('min_narrative_length', '50', 'Minimum narrative length for a complete rating (brief §16.3)'),
  ('agreement_threshold', '1', 'Divergence above this many points needs discussion (brief §6.4, §16.1)'),
  ('allow_single_assessor', 'true', 'Single-assessor profiles allowed, labelled Exploratory (brief §16.2)'),
  ('gate_enforcement', 'true', 'false = advisory mode; the PI advances stages by hand (PLAN D-19)'),
  ('conditions_resolution_required', 'false', 'Make "conditions from previous gate resolved" a Required criterion (PLAN D-17)');

do $$
declare
  fv uuid;
  d_what uuid; d_how uuid; d_end uuid;
  dom uuid;
  rec record;
  i int;
begin
  insert into public.framework_versions (label) values ('v1') returning id into fv;

  insert into public.dimensions (framework_version_id, code, label, sub_label, color_token, sort)
  values (fv, 'WHAT', 'WHAT', 'Orientation', 'what', 1) returning id into d_what;
  insert into public.dimensions (framework_version_id, code, label, sub_label, color_token, sort)
  values (fv, 'HOW', 'HOW', 'Process', 'how', 2) returning id into d_how;
  insert into public.dimensions (framework_version_id, code, label, sub_label, color_token, sort)
  values (fv, 'END', 'TO WHAT END', 'Outcomes', 'end', 3) returning id into d_end;

  insert into public.rating_levels (framework_version_id, value, label) values
    (fv, 1, 'Emerging / Minimal'), (fv, 2, 'Partial / Inconsistent'), (fv, 3, 'Moderate / Developing'),
    (fv, 4, 'Strong / Consistent'), (fv, 5, 'Transformative / Exemplary');

  for rec in select * from (values
    (1, 'D1', 'Equity & Justice', 'WHAT',
     array['Priority given to marginalised / underserved populations in targeting and design',
           'Resources allocated by need rather than political or economic factors',
           'Attention to root causes of inequity, not only symptoms'],
     'Targeting criteria; disaggregated coverage; allocation formulas; theory of change',
     'Elite capture; politically driven allocation; symptom-only response',
     'Shifts in targeting or eligibility; cuts falling on lowest-coverage groups'),
    (2, 'D2', 'Common Good Orientation', 'WHAT',
     array['Collective outcomes prioritised over organisational gain',
           'Public goods (data, knowledge, technology) shared openly',
           'Strengthens public systems rather than parallel structures'],
     'Strategy docs; open-data platforms; licensing terms; system integration',
     'Organisational visibility prioritised; proprietary restriction; parallel systems',
     'Moves to proprietary data or parallel reporting'),
    (3, 'D3', 'Mutual Responsibility', 'WHAT',
     array['Responsibilities and accountabilities clearly shared',
           'Risk borne in fair shares by funders, implementers, communities',
           'Reciprocal obligations rather than one-way dependency'],
     'MOUs; joint reviews; contract terms; co-financing commitments',
     'One-sided obligations; all risk carried locally',
     'Co-financing commitments missed; risk-transfer clauses added'),
    (4, 'D4', 'Power Transformation', 'HOW',
     array['Decision-making power shared with local actors',
           'Who sets priorities and controls allocation',
           'Mechanisms to shift authority to local ownership over time',
           'Historical power imbalances acknowledged and addressed'],
     'Decision records; committee composition; budget authority; transition plans',
     'All decisions external; no local budget control; no transfer path',
     'Transition milestones slipping; local seats on decision bodies reduced'),
    (5, 'D5', 'Inclusive Participation', 'HOW',
     array['Affected communities involved in design',
           'Marginalised groups have voice in decisions, not only consultation',
           'Participation mechanisms accessible and culturally appropriate'],
     'Consultation records; governance roles; voting rights; language, venue, compensation',
     'Token consultation; informed-only participation; inaccessible processes',
     'Community bodies sidelined; consultation shortened or skipped'),
    (6, 'D6', 'Transparency & Accountability', 'HOW',
     array['Information on funding, decisions, outcomes openly accessible',
           'Communities can hold actors accountable',
           'Failures and challenges reported honestly'],
     'Published budgets; grievance mechanisms; reports with negative findings',
     'Hidden information; no feedback loop; only success stories',
     'Publication delays; grievances unanswered'),
    (7, 'D7', 'Sustainability & Sovereignty', 'END',
     array['Local health-system capacity strengthened long-term',
           'Clear transition plan toward local ownership and control',
           'Builds on national priorities'],
     'Capacity plans; transition strategy; domestic financing data; alignment with national strategies',
     'Capacity substituted not built; no exit plan; externally set priorities',
     'Rising external share of funding; domestic budget lines not released'),
    (8, 'D8', 'Relational Trust', 'END',
     array['Genuine partnership rather than donor–recipient dynamics',
           'Relationships marked by mutual respect and learning',
           'Trust built through consistent, reliable engagement'],
     'Partner perception data; joint reviews; commitments-honoured record',
     'Command relationships; disrespect; broken promises',
     'Commitments broken or delayed; partner turnover'),
    (9, 'D9', 'Transformative Impact', 'END',
     array['Contribution to systemic change beyond immediate outcomes',
           'Shifts in norms, policies or structures toward equity',
           'Challenges rather than reinforces existing inequities'],
     'Policy/system change evidence; norm surveys; distributional analysis',
     'Status quo maintained; no structural shift; inequities reproduced',
     'Reversal of enabling policies; stalled reforms')
  ) as t(sort, code, name, dim, prompts, evidence, red_flags, signal) loop
    insert into public.domains (framework_version_id, dimension_id, code, name, evidence_to_look_for, red_flags, sort)
    values (fv, case rec.dim when 'WHAT' then d_what when 'HOW' then d_how else d_end end,
            rec.code, rec.name, rec.evidence, rec.red_flags, rec.sort)
    returning id into dom;
    for i in 1 .. array_length(rec.prompts, 1) loop
      insert into public.indicators (domain_id, sort, prompt) values (dom, i, rec.prompts[i]);
    end loop;
    insert into public.signal_definitions (domain_id, description) values (dom, rec.signal);
  end loop;

  -- Appendix B gate criteria. auto_check_key marks criteria checkable from data (brief §6.3).
  insert into public.gate_criteria (framework_version_id, gate, sort, text, required, auto_check_key) values
    (fv, 'G0', 1, 'Subject type identified', true, 'subject_type_set'),
    (fv, 'G0', 2, 'Decision, decision-maker and decision window named', true, 'decision_recorded'),
    (fv, 'G0', 3, 'Human-rights floor screen done; flagrant violations escalated rather than profiled', true, 'hr_screen_answered'),
    (fv, 'G0', 4, 'Requester has no controlling interest, or it is declared', false, null),
    (fv, 'G1', 1, 'Context profile complete', true, 'context_complete'),
    (fv, 'G1', 2, 'Actor map lists funders, implementers, community actors, government', true, 'actor_categories_complete'),
    (fv, 'G1', 3, 'COI declared by all assessors', true, 'coi_all_assessors'),
    (fv, 'G1', 4, '≥2 independent assessors, or single-assessor flagged', true, 'min_assessors_or_single'),
    (fv, 'G1', 5, 'Plan for affected-community voice documented', true, 'community_voice_plan'),
    (fv, 'G2', 1, 'Every domain has ≥1 linked evidence item or a documented gap', true, 'evidence_or_gap_all_domains'),
    (fv, 'G2', 2, '≥2 source types overall', true, 'min_two_evidence_types'),
    (fv, 'G2', 3, 'Community-origin evidence for D5 and D8', true, 'community_evidence_d5_d8'),
    (fv, 'G2', 4, 'Evidence gaps logged with effect on confidence', false, 'gaps_have_effect'),
    (fv, 'G3', 1, 'All assigned assessors submitted, or withdrawn by the PI with a recorded reason', true, 'all_assessors_submitted'),
    (fv, 'G3', 2, 'Every rating has narrative and confidence', true, 'all_ratings_complete'),
    (fv, 'G3', 3, 'Independence maintained', true, null),
    (fv, 'G4', 1, 'Alignment, cost/burden and voice-reality checks done', true, 'integrity_sections_complete'),
    (fv, 'G4', 2, 'All four flags rated; every High explained', true, 'flags_rated_high_explained'),
    (fv, 'G4', 3, 'Solidarity type classified with evidence', true, 'solidarity_type_set'),
    (fv, 'G4', 4, 'Marginalised/affected groups represented in deliberation', true, 'community_participant_scheduled'),
    (fv, 'G5', 1, 'Every domain with >1-point divergence discussed', true, 'divergent_domains_discussed'),
    (fv, 'G5', 2, 'Consensus or documented dissent for each domain', true, 'consensus_or_dissent_all'),
    (fv, 'G5', 3, 'Minority interpretations archived with rationale', true, null),
    (fv, 'G6', 1, 'Reviewer QA done', true, 'reviewer_verified'),
    (fv, 'G6', 2, 'Member-check with affected stakeholders done', true, 'member_check_recorded'),
    (fv, 'G6', 3, 'Domain-level reporting only', true, 'domain_level_only'),
    (fv, 'G6', 4, 'Confidence caveats and limitations stated', true, null),
    (fv, 'G7', 1, 'Delivered to named decision-maker in tailored format', true, 'kt_product_logged'),
    (fv, 'G7', 2, 'Response recorded: action plan or documented no-action', true, 'response_recorded'),
    (fv, 'G7', 3, 'Follow-up date set', true, 'follow_up_date_set'),
    (fv, 'G7', 4, 'Barriers to use identified', false, null),
    (fv, 'G8', 1, 'Follow-up review of actions done', true, 'follow_up_review_done'),
    (fv, 'G8', 2, 'Signals reviewed since last assessment', true, 'signals_reviewed'),
    (fv, 'G8', 3, 'Reassessment decision made', true, 'reassessment_decision'),
    (fv, 'G8', 4, 'Lessons logged to framework revision log', false, 'lessons_logged');

  -- PLAN D-17: conditions from a conditional go are tracked on the next gate (Advisory by default).
  insert into public.gate_criteria (framework_version_id, gate, sort, text, required, auto_check_key)
  select fv, g::gate_code, 99, 'Conditions from the previous gate resolved', false, 'previous_conditions_resolved'
  from unnest(array['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8']) g;

  update public.framework_versions set status = 'published' where id = fv;
end;
$$;
