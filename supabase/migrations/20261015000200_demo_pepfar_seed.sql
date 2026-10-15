-- DEMO PROFILE: "PEPFAR project in Africa" (PLAN D-53).
-- An illustrative, fully worked SOLIDARIS cycle (G0–G8) built from PUBLIC SOURCES for training.
-- The team, meetings, ratings, member-checks and uptake events are FICTIONAL and labelled as such;
-- the evidence items are real, cited public documents (accessed October 2026). It is not an
-- official evaluation of PEPFAR. The demo is read-only for everyone (guard_demo trigger).

do $$
declare
  fv uuid;
  v_subject uuid;
  v_project uuid := 'de300000-0000-4000-8000-000000000100';
  personas jsonb := jsonb_build_object(
    'pi', 'de300000-0000-4000-8000-000000000001', 'a1', 'de300000-0000-4000-8000-000000000002',
    'a2', 'de300000-0000-4000-8000-000000000003', 'rev', 'de300000-0000-4000-8000-000000000004',
    'com', 'de300000-0000-4000-8000-000000000005', 'exp', 'de300000-0000-4000-8000-000000000006',
    'kt', 'de300000-0000-4000-8000-000000000007', 'obs', 'de300000-0000-4000-8000-000000000008');
  ev_ids jsonb := '{}';
  gap_ids jsonb := '{}';
  assess_ids jsonb := '{}';
  rec record;
  v_id uuid;
  v_rating uuid;
  v_review uuid;
  v_session uuid;
  v_g4_review uuid;
  k text;
begin
  perform set_config('app.demo_seed', 'on', true);
  select id into fv from public.framework_versions where label = 'v1';

  -- Fictional demo personas: no password, .invalid addresses (cannot sign in or receive email).
  for rec in select * from (values
    ('pi',  'demo-pi@demo.solidaris.invalid',        'Dr Amara Okafor (demo PI)',                 'Principal Investigator', 'Nigeria',      'Global health policy'),
    ('a1',  'demo-assessor1@demo.solidaris.invalid', 'Dr Kwame Mensah (demo assessor)',           'Health systems researcher', 'Ghana',     'Health economics'),
    ('a2',  'demo-assessor2@demo.solidaris.invalid', 'Dr Lindiwe Dube (demo assessor)',           'HIV programme researcher', 'South Africa', 'Public health'),
    ('rev', 'demo-reviewer@demo.solidaris.invalid',  'Prof. Sarah Nakato (demo reviewer)',        'Methods reviewer',       'Uganda',       'Epidemiology'),
    ('com', 'demo-community@demo.solidaris.invalid', 'Grace Achieng (demo community participant)', 'PLHIV network coordinator', 'Kenya',     'Community health'),
    ('exp', 'demo-expert@demo.solidaris.invalid',    'Dr Tomás Ribeiro (demo external expert)',   'Health financing adviser', 'Mozambique', 'Health financing'),
    ('kt',  'demo-ktlead@demo.solidaris.invalid',    'Fatima Bello (demo KT lead)',               'Knowledge-translation lead', 'Nigeria',  'Policy communication'),
    ('obs', 'demo-observer@demo.solidaris.invalid',  'Jonas Weber (demo observer)',               'Programme officer',      'Germany',      'Development cooperation')
  ) as t(k, email, name, position, country, discipline) loop
    insert into auth.users (id, email, raw_user_meta_data)
    values ((personas ->> rec.k)::uuid, rec.email, jsonb_build_object(
      'full_name', rec.name, 'institution_name', 'SOLIDARIS demo team (fictional)', 'position', rec.position,
      'country', rec.country, 'discipline', rec.discipline, 'consent_processing', true, 'consent_handling', true,
      'consent_email', false, 'consent_notice_version', 'demo'));
    update public.profiles set is_demo = true where id = (personas ->> rec.k)::uuid;
  end loop;

  -- Subject and project -------------------------------------------------------------------
  insert into public.subjects (type, name, country, region, description, created_by)
  values ('programme', 'PEPFAR project in Africa', 'Sub-Saharan Africa (multi-country)', 'East, Southern, Central and West Africa',
    'DEMO PROFILE — an illustrative SOLIDARIS assessment of the U.S. President’s Emergency Plan for AIDS Relief (PEPFAR) in sub-Saharan Africa, built from public sources for training. The team, meetings, ratings and stakeholder responses are fictional; the evidence items are real, cited public documents. It is not an official evaluation of PEPFAR.',
    (personas ->> 'pi')::uuid)
  returning id into v_subject;

  insert into public.assessment_projects (id, subject_id, framework_version_id, status, assessment_type, is_demo, created_by, created_at)
  values (v_project, v_subject, fv, 'draft', 'baseline', true, (personas ->> 'pi')::uuid, '2026-01-12');

  insert into public.project_members (project_id, user_id, role, coi_declared_at, coi_statement, created_by)
  select v_project, (personas ->> k2)::uuid, r::project_role, '2026-01-15',
         case when r = 'assessor' then 'No financial or professional links to PEPFAR implementing partners (demo declaration).' end,
         (personas ->> 'pi')::uuid
  from (values ('pi','pi'), ('a1','assessor'), ('a2','assessor'), ('rev','reviewer'), ('com','community_participant'),
               ('exp','external_expert'), ('kt','kt_lead'), ('obs','observer')) as m(k2, r);

  -- T1: decision record ---------------------------------------------------------------------
  insert into public.decision_records (project_id, decision_text, decision_maker_name, decision_maker_institution,
                                       window_start, window_end, hr_screen_result, hr_screen_note, created_by)
  values (v_project,
    'Whether partner governments and funders should adopt the proposed 2026–2030 transition of national HIV programmes under the new bilateral health compacts, and which safeguards for equity, community voice and continuity of services to require.',
    'National HIV programme steering committees (illustrative)', 'Ministries of Health with PEPFAR country teams (illustrative)',
    '2026-04-01', '2026-12-31', 'pass',
    'No flagrant human-rights violations by the programme were identified. Reported harms to key-population services after the 2025 funding disruptions are profiled under D1 and D5 rather than escalated.',
    (personas ->> 'pi')::uuid);

  -- T2: context profile and actor map -------------------------------------------------------
  insert into public.context_profiles (project_id, financing, governance, target_population, community_voice_plan, created_by)
  values (v_project,
    'U.S. appropriations for PEPFAR total over US$130 billion since 2003; FY2026 funding is US$6.0 billion (US$4.7 billion bilateral HIV, US$1.3 billion multilateral) (KFF fact sheet, May 2026). From April 2026 funding flows through five-year bilateral health compacts: partner countries co-invest about 39% across signed agreements while U.S. funding is about 34% lower than historical levels (KFF MOU tracker, Oct 2026). Kenya, for example, receives US$1.6 billion and commits about US$850 million (The Star, Dec 2025).',
    'Led by the Office of the Global AIDS Coordinator at the U.S. Department of State. USAID was dissolved in 2025 and its global health functions moved into the State Department; CDC remains an implementing agency (KFF). Planning historically ran through annual Country and Regional Operational Plans (COP/ROP) with host governments and civil society; from 2026 through government-to-government compacts. Multilateral support runs through the Global Fund and UNAIDS.',
    'People living with HIV (20.6 million on PEPFAR-supported treatment in FY2024, KFF), adolescent girls and young women (DREAMS), key populations, orphans and vulnerable children, and pregnant women and infants, in high-burden sub-Saharan African countries.',
    'A community participant from a network of people living with HIV sits on the deliberation panel; findings are member-checked with PLHIV networks and community-led monitoring volunteers; community-origin evidence (Ritshidze community-led monitoring, Health GAP) is required for D5 and D8.',
    (personas ->> 'pi')::uuid);

  insert into public.actors (project_id, category, name, role, influence, participation_level, created_by)
  select v_project, c::actor_category, n, r, i::risk_level, pl, (personas ->> 'pi')::uuid from (values
    ('funder', 'U.S. Government — Office of the Global AIDS Coordinator, Department of State', 'Sets strategy, allocates funding, negotiates compacts', 'high', 'decides'),
    ('funder', 'Global Fund to Fight AIDS, Tuberculosis and Malaria', 'Co-funds HIV commodities and services', 'medium', 'co-decides at country level'),
    ('implementer', 'Local implementing partners (NGOs, faith-based organisations)', 'Deliver testing, treatment and prevention services', 'medium', 'consulted'),
    ('implementer', 'CDC and international implementing partners', 'Technical support, laboratories, data systems', 'medium', 'implements'),
    ('community', 'Networks of people living with HIV and community-led monitoring groups (e.g. Ritshidze)', 'Monitor service quality, advocate', 'low', 'consulted'),
    ('community', 'Adolescent girls and young women and key-population networks', 'Service users; DREAMS participants', 'low', 'informed'),
    ('government', 'Ministries of Health and national AIDS councils', 'Own national HIV programmes; co-finance under compacts', 'medium', 'co-decides')
  ) as a(c, n, r, i, pl);

  -- T5: evidence (real public sources) --------------------------------------------------------
  for rec in select * from (values
    ('kff', 'KFF — The U.S. President’s Emergency Plan for AIDS Relief (PEPFAR) fact sheet', 'literature', 'independent', 'KFF', 'secondary', '2026-05-22',
      'https://www.kff.org/global-health-policy/fact-sheet/the-u-s-presidents-emergency-plan-for-aids-relief-pepfar/',
      'Funding history (>US$130 bn since 2003; FY2026 US$6.0 bn), 20.6 million on treatment (FY2024), 26 million lives saved (PEPFAR estimate), 2025 governance changes and lapsed authorisation.',
      array['D2','D3','D7','D9'], 'a1'),
    ('strategy', 'PEPFAR — Fulfilling America’s Promise to End the HIV/AIDS Pandemic by 2030 (2022 five-year strategy)', 'document', 'funder', 'U.S. Department of State / PEPFAR', 'government_document', '2022-12-01',
      'https://www.prepwatch.org/wp-content/uploads/2022/12/PEPFARs-5-Year-Strategy_WAD2022_FINAL_COMPLIANT_3.0.pdf',
      'Five pillars (health equity for priority populations, sustainability, public health systems, partnerships, science) and enablers including community leadership.',
      array['D1','D2','D5','D7'], 'a1'),
    ('afghs', 'U.S. Department of State — America First Global Health Strategy', 'document', 'funder', 'U.S. Department of State', 'government_document', '2025-09-18',
      'https://www.state.gov/wp-content/uploads/2025/09/America-First-Global-Health-Strategy-Report.pdf',
      'Moves from NGO-implemented disease programmes to direct, time-limited bilateral agreements with governments, with co-financing and transition of commodities and frontline health workers.',
      array['D3','D4','D7'], 'a2'),
    ('tracker', 'KFF Tracker — America First MOU bilateral global health agreements', 'admin_data', 'independent', 'KFF', 'secondary', '2026-10-08',
      'https://www.kff.org/global-health-policy/kff-tracker-america-first-mou-bilateral-global-health-agreements/',
      '36 signed agreements (2026–2030); partner co-investment 39% over five years; U.S. funding US$8.1 bn (34%) lower than historical levels.',
      array['D3','D4','D6','D7'], 'a2'),
    ('kenya', 'The Star (Kenya) — Kenya to receive US health funding in April next year', 'media', 'independent', 'The Star', 'media', '2025-12-08',
      'https://www.the-star.co.ke/health/2025-12-08-kenya-to-receive-us-health-funding-in-april-next-year',
      'Kenya–US five-year framework: US$1.6 bn from the U.S., about US$850 m domestic co-financing; procurement, health-worker salaries, data systems and supply chains move to government by 2031; donors still fund over half of HIV programme costs.',
      array['D3','D4','D7'], 'a1'),
    ('evaborhene', 'Evaborhene NA — Leverage and Constraint: African Agency under the America First Global Health Strategy (Global Policy blog)', 'literature', 'independent', 'Global Policy Journal', 'secondary', '2026-02-05',
      'https://www.globalpolicyjournal.com/blog/05/02/2026/leverage-and-constraint-african-agency-under-america-first-global-health-strategy',
      'Argues compact terms track strategic alignment rather than need; front-loaded co-financing and data-sharing clauses; Kenyan civil society challenged the framework in court.',
      array['D4','D5','D8'], 'a2'),
    ('icap', 'Saito S, Farahani M, Kunda S, et al. — Effects of stop-work orders on HIV testing, treatment and PMTCT in four sub-Saharan African countries (JIAS 2025)', 'literature', 'implementer', 'ICAP at Columbia University', 'peer_reviewed', '2025-07-01',
      'https://icap.columbia.edu/tools_resources/effects-of-stop-work-orders-on-hiv-testing-treatment-and-programmes-for-prevention-of-vertical-transmission-in-four-sub-saharan-african-countries/',
      'Data from 165 facilities in Angola, DRC, South Sudan and Zambia: ART initiations fell 16–32% and HIV-positive tests 17–58% after the January 2025 stop-work orders, with limited recovery.',
      array['D1','D7','D8'], 'a1'),
    ('lankiewicz', 'Lankiewicz E, et al. — Early impacts of the PEPFAR stop-work order: a rapid assessment (JIAS 2025)', 'literature', 'independent', 'Journal of the International AIDS Society', 'peer_reviewed', '2025-06-01',
      'https://www.differentiatedservicedelivery.org/wp-content/uploads/Journal-of-the-International-AIDS-Society-2025-Lankiewicz-Early-impacts-of-the-PEPFAR-stop%E2%80%90work-order-a-rapid.pdf',
      'Rapid assessment of service disruption among PEPFAR implementing partners after the January 2025 stop-work order.',
      array['D1','D5','D8'], 'a2'),
    ('unaids', 'UNAIDS — 2025 Global AIDS Update: AIDS, Crisis and the Power to Transform (press release)', 'document', 'independent', 'UNAIDS', 'secondary', '2025-07-10',
      'https://unaids.org/en/resources/presscentre/pressreleaseandstatementarchive/2025/july/20250710_global-aids-update',
      'If US-supported services collapse, 6 million extra infections and 4 million extra deaths by 2029; PrEP initiation in Nigeria fell from 40,000 to 6,000 a month; over 60% of women-led HIV organisations surveyed lost funding; 25 of 60 countries plan domestic budget increases (~US$180 m).',
      array['D1','D5','D7','D9'], 'a2'),
    ('tenbrink', 'ten Brink D, et al. — Impact of international HIV funding cuts, 2025–2030 (The Lancet HIV, March 2025; Burnet Institute summary)', 'literature', 'independent', 'Burnet Institute / The Lancet HIV', 'peer_reviewed', '2025-03-26',
      'https://www.burnet.edu.au/knowledge-and-media/news-plus-updates/hiv-funding-cuts-could-lead-to-293-million-avoidable-deaths-by-2030-study',
      'Modelling in 26 countries: 4.4–10.8 million additional infections and up to 2.9 million additional deaths by 2030 if cuts are not mitigated; sub-Saharan Africa most affected.',
      array['D1','D9'], 'a1'),
    ('ritshidze', 'Ritshidze community-led monitoring — reported by Spotlight: “World’s biggest community-led health watchdog falters as US funding fades”', 'observation', 'community', 'Ritshidze (TAC, NAPWA, PWN and partners) via Spotlight', 'media', '2025-10-22',
      'https://spotlightnsp.co.za/2025/10/22/ritshidze-worlds-biggest-community-led-health-watchdog-falters-as-us-funding-fades/',
      'Community monitoring of 326 facilities and 32,530 health-care users after the 2025 cuts: fewer three-month ARV supplies, reduced viral-load testing capacity; Ritshidze lost its US-funded budget and paused accountability meetings.',
      array['D5','D6','D8'], 'a2'),
    ('healthgap', 'Health GAP (Thibela B) — PEPFAR is Rolling the Clock Back on Meaningful Civil Society Engagement', 'document', 'community', 'Health GAP', 'grey_literature', '2024-02-08',
      'https://healthgap.org/pepfar-is-rolling-the-clock-back-on-meaningful-civil-society-engagement/',
      'Civil society reports shortened COP23 review meetings, closed-door budget-cut discussions and a shift from engagement to presentation; past engagement had won PrEP acceleration and community-led programmes.',
      array['D4','D5','D6'], 'a1'),
    ('panorama', 'PEPFAR Panorama Spotlight — public results (MER) and expenditure data', 'admin_data', 'funder', 'U.S. Department of State', 'website', '2026-01-15',
      'https://data.pepfar.gov/',
      'Authoritative public PEPFAR programme data: results by country and year, expenditure reporting since FY2012.',
      array['D1','D2','D6'], 'a1'),
    ('iom', 'Institute of Medicine — Evaluation of PEPFAR (2013)', 'literature', 'independent', 'National Academies Press', 'secondary', '2013-02-20',
      'https://www.nationalacademies.org/read/18256/chapter/22',
      'Four-year evaluation across 30+ countries: country ownership requires relinquishing control and cannot follow a generic timeline; transition must be paced to each country.',
      array['D2','D4','D7'], 'a2'),
    ('ghsp', 'An Evaluation of Local Implementing Partner Performance During the First 2 Years of the USAID/PEPFAR Transition (Global Health: Science and Practice 11(3), 2023)', 'literature', 'independent', 'Global Health: Science and Practice', 'peer_reviewed', '2023-06-08',
      'https://www.ghspjournal.org/content/11/3/e2200337',
      'Evaluates performance after USAID/PEPFAR committed to route 70% of funding directly to local partners, including governments.',
      array['D3','D4','D7'], 'a1'),
    ('dreams', 'LSHTM — DREAMS impact evaluation (Birdthistle et al.)', 'literature', 'independent', 'London School of Hygiene & Tropical Medicine', 'peer_reviewed', '2021-10-01',
      'https://www.lshtm.ac.uk/research/centres-projects-groups/dreams',
      'Weak statistical evidence that DREAMS achieved its 40% HIV-incidence reduction among adolescent girls and young women, alongside improvements in PrEP use, condom use and reduced partner violence.',
      array['D1','D9'], 'a2'),
    ('roadmaps', 'UNAIDS — Building country-led, sustainable HIV responses (sustainability roadmaps with PEPFAR and the Global Fund)', 'document', 'independent', 'UNAIDS', 'secondary', '2024-12-20',
      'https://unaids.org/en/resources/presscentre/featurestories/2024/december/20241220_building-country-led-sustainable-hiv-responses',
      'Joint UNAIDS–PEPFAR–Global Fund approach: countries develop sustainability roadmaps across leadership, laws, financing, services and systems.',
      array['D2','D7'], 'a1')
  ) as e(k, title, type, origin, source, source_type, dt, url, descr, codes, by_key) loop
    insert into public.evidence_items (project_id, title, type, origin, source, source_type, evidence_date, url, description,
                                       confidentiality, created_by)
    values (v_project, rec.title, rec.type::evidence_type, rec.origin::evidence_origin, rec.source, rec.source_type::evidence_source,
            rec.dt::date, rec.url, rec.descr, 'public', (personas ->> rec.by_key)::uuid)
    returning id into v_id;
    ev_ids := ev_ids || jsonb_build_object(rec.k, v_id);
    insert into public.evidence_domain_links (evidence_id, domain_id, created_by)
    select v_id, d.id, (personas ->> rec.by_key)::uuid from public.domains d where d.framework_version_id = fv and d.code = any (rec.codes);
  end loop;

  for rec in select * from (values
    ('cofin', 'D3', 'Partner-country co-financing compliance under the 2026 compacts is not yet publicly reported.', 'Lowers confidence in D3 and D7.'),
    ('perception', 'D8', 'No systematic partner-perception survey across PEPFAR countries after the 2025 disruptions.', 'Lowers confidence in D8.'),
    ('texts', 'D2', 'Full compact texts, including data- and specimen-sharing clauses, are not all public.', 'Lowers confidence in D2 and D6.')
  ) as g(k, code, descr, effect) loop
    insert into public.evidence_gaps (project_id, domain_id, description, effect_on_confidence, created_by)
    select v_project, d.id, rec.descr, rec.effect, (personas ->> 'a1')::uuid from public.domains d where d.framework_version_id = fv and d.code = rec.code
    returning id into v_id;
    gap_ids := gap_ids || jsonb_build_object(rec.k, v_id);
  end loop;

  -- T3: two independent assessments --------------------------------------------------------
  foreach k in array array['a1', 'a2'] loop
    insert into public.assessments (project_id, assessor_id, created_by, created_at)
    values (v_project, (personas ->> k)::uuid, (personas ->> k)::uuid, '2026-02-12') returning id into v_id;
    assess_ids := assess_ids || jsonb_build_object(k, v_id);
    insert into public.domain_ratings (assessment_id, domain_id, created_by)
    select v_id, d.id, (personas ->> k)::uuid from public.domains d where d.framework_version_id = fv;
  end loop;

  for rec in select * from (values
    ('a1','D1',4,'medium','PEPFAR targets people living with HIV, adolescent girls and young women (DREAMS), key populations and children, and supported treatment for 20.6 million people in FY2024 (KFF 2026; Panorama). The 2025 stop-work order hit prevention and key-population services hardest (UNAIDS 2025; ICAP 2025), which tempers but does not erase a strong equity orientation.', array['kff','panorama','unaids','icap'], null),
    ('a2','D1',3,'medium','Equity is built into targeting, but DREAMS showed weaker-than-planned incidence impact (LSHTM evaluation) and the 2025 cuts fell on the groups with least coverage: PrEP initiation in Nigeria fell from 40,000 to 6,000 a month (UNAIDS 2025). Allocation now follows bilateral compacts rather than burden alone.', array['dreams','unaids','lankiewicz'], null),
    ('a1','D2',3,'medium','Open public data through Panorama Spotlight and long-term investment in laboratories, supply chains and health workers strengthened public systems (2022 strategy; Panorama). The 2013 IOM evaluation noted heavy reliance on partner-managed parallel structures, and not all compact terms are public.', array['panorama','strategy','iom'], 'texts'),
    ('a2','D2',3,'medium','Public goods are shared (results and expenditure data, joint sustainability roadmaps with UNAIDS and the Global Fund), but services were long run through parallel partner systems; government-to-government compacts may integrate them, though data-sharing terms are not fully public.', array['panorama','roadmaps','kff'], 'texts'),
    ('a1','D3',2,'medium','Responsibilities were largely set by the U.S.: the 2025 stop-work order shifted risk onto partner countries overnight (ICAP 2025), and the compacts require partners to co-invest 39% as U.S. funding falls 34% (KFF tracker). U.S. reciprocal obligations are thinly specified and compliance data is not yet public.', array['icap','tracker','afghs'], 'cofin'),
    ('a2','D3',3,'low','The compacts make shared obligations explicit for the first time — Kenya commits about US$850 million against US$1.6 billion from the U.S. (The Star 2025) — a step towards mutual accountability, but risk distribution remains one-sided and co-financing compliance cannot yet be verified.', array['kenya','tracker','ghsp'], 'cofin'),
    ('a1','D4',2,'medium','Priorities and allocation were set through U.S.-led COP processes and, from 2026, through compacts negotiated under strongly asymmetric leverage (Evaborhene 2026; America First strategy). The local-partner shift (GHSP 2023) moved implementation more than decision power, and civil society influence in planning declined from 2024 (Health GAP).', array['evaborhene','afghs','ghsp','healthgap'], null),
    ('a2','D4',4,'medium','Authority is genuinely moving to national governments: compacts channel funds government-to-government and hand over procurement, health workers and data systems by 2031 (Kenya framework). With the earlier local-partner transition (GHSP 2023) this is the largest transfer of control in PEPFAR’s history.', array['kenya','ghsp','tracker'], null),
    ('a1','D5',3,'medium','COP planning historically gave civil society and people living with HIV a formal seat and community-led monitoring was funded (2022 strategy; Ritshidze). Participation narrowed from 2024 (Health GAP) and communities were largely absent from compact negotiations (Evaborhene 2026).', array['strategy','ritshidze','healthgap','evaborhene'], null),
    ('a2','D5',2,'medium','Community voice weakened sharply: Ritshidze lost its U.S.-funded budget in 2025 and paused accountability meetings, over 60% of women-led HIV organisations surveyed lost funding (UNAIDS 2025), and compacts are negotiated between governments only.', array['ritshidze','unaids','healthgap'], null),
    ('a1','D6',3,'medium','Results and expenditure data are public on Panorama Spotlight and COP documents have been published; the compact terms and the 2025 decisions were far less transparent, and Kenyan civil society turned to the courts (Evaborhene 2026).', array['panorama','evaborhene','tracker'], 'texts'),
    ('a2','D6',3,'medium','Strong data transparency (Panorama) but weaker transparency of decisions: civil society reported closed-door budget-cut discussions (Health GAP 2024) and compact texts are only partly public. Community monitors published findings openly (Ritshidze).', array['panorama','healthgap','ritshidze'], 'texts'),
    ('a1','D7',2,'low','Transition is being forced on a fixed timeline after an abrupt shock: Kenya must absorb HIV commodities and health-worker costs by 2031 while donors still fund over half its HIV programme (The Star 2025). The 2013 IOM evaluation warned against generic transition timelines.', array['kenya','iom','icap','kff'], 'cofin'),
    ('a2','D7',4,'medium','For the first time each country has a dated, financed transition plan — sustainability roadmaps (UNAIDS 2024) and compacts with rising domestic co-investment (KFF tracker) — aligned with national priorities, which is the core of sovereignty. 25 of 60 countries plan domestic budget increases (UNAIDS 2025).', array['roadmaps','tracker','unaids','afghs'], 'cofin'),
    ('a1','D8',2,'low','Two decades of partnership were damaged by the January 2025 stop-work order: testing and treatment initiation fell by up to a third in several countries (ICAP 2025; Lankiewicz 2025). No systematic partner-perception data exists.', array['icap','lankiewicz'], 'perception'),
    ('a2','D8',2,'low','Trust built over twenty years was undermined by abrupt, unilateral decisions; community monitors report service decline after the cuts (Ritshidze 2025), and partners describe compact terms as imposed (Evaborhene 2026).', array['ritshidze','evaborhene'], 'perception'),
    ('a1','D9',4,'medium','PEPFAR reports 26 million lives saved and supports treatment at scale (KFF 2026); it shifted norms on differentiated service delivery and PrEP. Modelling shows how fragile these gains are if funding is not replaced (ten Brink, Lancet HIV 2025).', array['kff','tenbrink','dreams'], null),
    ('a2','D9',3,'medium','Outcomes are transformative, but structural change is weaker: dependency on external funding persisted for two decades and modelled cuts could undo progress since 2000 (ten Brink 2025; UNAIDS 2025).', array['tenbrink','unaids','kff'], null)
  ) as r(k, code, rating, conf, narrative, evs, gap) loop
    select dr.id into v_rating from public.domain_ratings dr join public.domains d on d.id = dr.domain_id
    where dr.assessment_id = (assess_ids ->> rec.k)::uuid and d.code = rec.code;
    insert into public.rating_evidence_links (domain_rating_id, evidence_id, created_by)
    select v_rating, (ev_ids ->> e)::uuid, (personas ->> rec.k)::uuid from unnest(rec.evs) e;
    if rec.gap is not null then
      insert into public.rating_gap_links (domain_rating_id, gap_id, created_by) values (v_rating, (gap_ids ->> rec.gap)::uuid, (personas ->> rec.k)::uuid);
    end if;
    update public.domain_ratings set rating = rec.rating, confidence = rec.conf::confidence_level, narrative = rec.narrative, is_complete = true
    where id = v_rating;
  end loop;

  -- Indicator responses (assessor A answers each prompt; assessor B the first prompt per domain)
  for rec in select * from (values
    ('a1','D1',1,'Strong: treatment, PMTCT, DREAMS and key-population programmes target groups with the highest burden.'),
    ('a1','D1',2,'Mostly by need through epidemiological targeting in COPs; from 2026 allocation is set in compacts.'),
    ('a1','D1',3,'Partly: DREAMS addresses structural drivers (schooling, violence), but most spending is biomedical.'),
    ('a1','D2',1,'Collective outcomes (epidemic control) are the stated aim; U.S. branding and reporting remain prominent.'),
    ('a1','D2',2,'Results and expenditure data are open on Panorama Spotlight; compact data terms are not fully public.'),
    ('a1','D2',3,'Laboratory, supply-chain and workforce investments strengthened public systems alongside parallel partner systems.'),
    ('a1','D3',1,'Accountability ran mainly to the U.S. Congress; compacts add country commitments.'),
    ('a1','D3',2,'Risk fell on partner countries during the 2025 stop-work order.'),
    ('a1','D3',3,'Obligations are reciprocal on paper (co-financing vs funding) but unevenly enforced.'),
    ('a1','D4',1,'Shared in COP meetings but final decisions rested with the U.S.'),
    ('a1','D4',2,'OGAC set priorities and allocation; governments gain budget control under compacts.'),
    ('a1','D4',3,'Transition mechanisms exist (local partners, compacts) with fixed timelines.'),
    ('a1','D4',4,'Historical imbalances are rarely acknowledged explicitly in strategy documents.'),
    ('a1','D5',1,'Communities contributed to COP design through civil society tables.'),
    ('a1','D5',2,'Voice was real but advisory; it narrowed from 2024.'),
    ('a1','D5',3,'Community-led monitoring was accessible and well used until funding was lost in 2025.'),
    ('a1','D6',1,'Programme data is openly accessible; decision documents less so.'),
    ('a1','D6',2,'Community-led monitoring and courts provided accountability routes.'),
    ('a1','D6',3,'Negative findings appear in independent sources more than in funder reporting.'),
    ('a1','D7',1,'Systems were strengthened, but salaries and commodities stayed donor-funded.'),
    ('a1','D7',2,'A dated transition exists in compacts; pace is set externally.'),
    ('a1','D7',3,'National strategic plans are referenced; priorities are negotiated.'),
    ('a1','D8',1,'Long-standing partnership, recently strained.'),
    ('a1','D8',2,'Mutual learning visible in DSD and community-led monitoring.'),
    ('a1','D8',3,'Reliability undermined by the 2025 stop-work order.'),
    ('a1','D9',1,'Large contribution to epidemic control and health systems.'),
    ('a1','D9',2,'Norm shifts on PrEP, differentiated care and community-led monitoring.'),
    ('a1','D9',3,'Challenges health inequity, but dependency patterns persisted.'),
    ('a2','D1',1,'Targeting is strong in design; delivery after 2025 left key populations behind.'),
    ('a2','D2',1,'Public goods shared through open data and joint roadmaps.'),
    ('a2','D3',1,'Compacts write down shared obligations for the first time.'),
    ('a2','D4',1,'Decision power is moving to governments through compacts.'),
    ('a2','D5',1,'Community participation has weakened since 2024.'),
    ('a2','D6',1,'Data transparency strong; decision transparency weak.'),
    ('a2','D7',1,'Financed, dated transition plans now exist in each country.'),
    ('a2','D8',1,'Trust damaged by abrupt unilateral decisions in 2025.'),
    ('a2','D9',1,'Transformative outcomes, weaker structural change.')
  ) as x(k, code, sort, response) loop
    insert into public.indicator_responses (assessment_id, indicator_id, response, created_by)
    select (assess_ids ->> rec.k)::uuid, i.id, rec.response, (personas ->> rec.k)::uuid
    from public.indicators i join public.domains d on d.id = i.domain_id
    where d.framework_version_id = fv and d.code = rec.code and i.sort = rec.sort;
  end loop;

  -- Each assessor's own integrity review (PLAN D-7), then submission (locks the assessment)
  for rec in select * from (values
    ('a1', 'instrumental', 'substantive', 'medium', 'high', 'high', 'medium',
     'Priorities, allocation and compact terms are set largely by the U.S.; partner leverage depends on strategic alignment (Evaborhene 2026).',
     'Fixed-timeline transition after an abrupt 2025 shock in donor-dependent systems (The Star 2025; ICAP 2025).', '2026-04-20'),
    ('a2', 'substantive', 'instrumental', 'low', 'medium', 'medium', 'medium', null, null, '2026-04-28')
  ) as i(k, prim, sec, washing, power, sust, incl, power_x, sust_x, submitted) loop
    insert into public.integrity_reviews (project_id, scope, assessment_id, primary_type, secondary_type, type_evidence, created_by)
    values (v_project, 'assessor', (assess_ids ->> rec.k)::uuid, rec.prim::solidarity_type, rec.sec::solidarity_type,
            'See domain narratives D4, D5 and D7.', (personas ->> rec.k)::uuid)
    returning id into v_id;
    insert into public.integrity_flags (integrity_review_id, flag, level, explanation, created_by) values
      (v_id, 'washing', rec.washing::risk_level, null, (personas ->> rec.k)::uuid),
      (v_id, 'power', rec.power::risk_level, rec.power_x, (personas ->> rec.k)::uuid),
      (v_id, 'sustainability', rec.sust::risk_level, rec.sust_x, (personas ->> rec.k)::uuid),
      (v_id, 'inclusion', rec.incl::risk_level, null, (personas ->> rec.k)::uuid);
    update public.assessments set status = 'submitted', submitted_at = rec.submitted::timestamptz where id = (assess_ids ->> rec.k)::uuid;
  end loop;

  -- T4: consolidated project integrity review, with reviewer QA -----------------------------
  insert into public.integrity_reviews (project_id, scope, created_by,
    alignment_goal_contradictions, alignment_funder_portfolio, alignment_values_vs_allocation,
    cost_who_bears, cost_transaction_proportionate, cost_shifted_to_local, cost_indirect_covered,
    voice_actual_involvement, voice_veto_power, voice_grievance_mechanisms, voice_input_led_to_change,
    primary_type, secondary_type, type_evidence, qa_by, qa_at, qa_notes)
  values (v_project, 'project', (personas ->> 'pi')::uuid,
    'The stated aims of country ownership and ending AIDS by 2030 sit alongside an abrupt 2025 stop-work order and 34% lower U.S. commitments under the compacts (KFF tracker), contrary to the gradual, country-paced transition the 2013 IOM evaluation recommended.',
    'Wider 2025 U.S. foreign-assistance cuts (USAID dissolution, reduced multilateral funding) weakened systems PEPFAR relies on, for example community-led monitoring funded via UNAIDS (Ritshidze).',
    'Compact terms appear to follow strategic alignment as well as need (Evaborhene 2026); the gap between stated equity values and allocation widened in 2025.',
    'Increasingly partner governments: Kenya must raise about US$850 million over five years (The Star 2025); across signed compacts partners co-invest 39% (KFF tracker).',
    'Historically heavy reporting (MER, annual COP cycles) on implementing partners; government-to-government channels may lighten this, but early implementation costs are unknown.',
    'Yes: procurement, health-worker salaries and data systems shift to governments on a fixed timeline with front-loaded co-financing (Kenya framework).',
    'Unclear: compacts emphasise commodities and frontline workers; indirect costs of community services and community-led monitoring are not visibly covered (condition set at G4, since documented).',
    'Meaningful in COP processes historically, declining since COP23 (Health GAP 2024) and largely absent from compact negotiation (Evaborhene 2026).',
    'No formal veto. Communities shaped COP priorities through advocacy; Kenyan civil society used the courts to challenge the compact.',
    'Community-led monitoring (Ritshidze) fed findings to programmes and health departments; its 2025 funding loss weakened this channel.',
    'Yes historically: advocacy secured PrEP acceleration and community-led treatment programmes (Health GAP 2024).',
    'instrumental', 'substantive',
    'Solidarity is real in outcomes (lives saved, systems built) but conditional and instrumental in governance: terms, pace and allocation are funder-driven (D3, D4, D7 narratives; Evaborhene 2026; KFF tracker).',
    (personas ->> 'rev')::uuid, '2026-06-22', 'Checked every High flag against cited evidence; the indirect-cost question was carried as a G4 condition.')
  returning id into v_id;
  insert into public.integrity_flags (integrity_review_id, flag, level, explanation, created_by) values
    (v_id, 'washing', 'medium', 'Ownership language in the 2025 strategy coexists with sharp funding reductions; risk of rhetoric outpacing practice.', (personas ->> 'pi')::uuid),
    (v_id, 'power', 'high', 'Priorities, allocation and compact terms are set largely by the U.S.; partner leverage depends on strategic alignment rather than need (Evaborhene 2026).', (personas ->> 'pi')::uuid),
    (v_id, 'sustainability', 'high', 'Fixed-timeline transition after an abrupt 2025 shock, in systems where donors still fund over half of HIV programme costs (The Star 2025; ICAP 2025).', (personas ->> 'pi')::uuid),
    (v_id, 'inclusion', 'medium', 'Community-led monitoring and key-population services were the first casualties of the 2025 cuts (UNAIDS 2025; Ritshidze).', (personas ->> 'pi')::uuid);

  -- T6: deliberation -------------------------------------------------------------------------
  for rec in select * from (values
    ('2026-07-14', 'Session 1: compared independent ratings; D4 and D7 diverged by two points and were discussed in depth.'),
    ('2026-07-28', 'Session 2: agreed consensus outcomes; D7 recorded as no consensus with both positions archived.')
  ) as s(held, notes) loop
    insert into public.deliberation_sessions (project_id, held_on, notes, created_by)
    values (v_project, rec.held::date, rec.notes, (personas ->> 'pi')::uuid) returning id into v_session;
    insert into public.deliberation_participants (session_id, user_id, role, created_by)
    select v_session, (personas ->> p)::uuid, r, (personas ->> 'pi')::uuid
    from (values ('pi','pi'), ('a1','assessor'), ('a2','assessor'), ('rev','reviewer'), ('com','community_participant'), ('exp','external_expert')) as x(p, r);
  end loop;

  insert into public.domain_discussions (project_id, domain_id, note, created_by)
  select v_project, d.id, n, (personas ->> who)::uuid
  from (values
    ('D4','a1','I rated 2 because the terms of the transfer are written in Washington: governments receive tasks, not decision power over priorities.'),
    ('D4','a2','I rated 4 because money, staff and supply chains are moving to ministries; that is control, even if the terms were negotiated unevenly.'),
    ('D4','com','From the community side, we were consulted less in 2024–2025 than before; transfer to government has not yet meant transfer to communities.'),
    ('D7','a1','Sovereignty needs a pace countries can sustain. A fixed 2031 handover after the 2025 shock risks service collapse.'),
    ('D7','a2','Without a dated plan transition never happens; compacts plus domestic budget increases are the first credible path.'),
    ('D7','exp','Co-financing compliance is the deciding evidence and is not yet public (gap logged). I would revisit D7 once 2026 budget execution is reported.'),
    ('D5','com','Ritshidze pausing accountability meetings removed our main channel to raise clinic problems.')
  ) as x(code, who, n)
  join public.domains d on d.framework_version_id = fv and d.code = x.code;

  insert into public.consensus_ratings (project_id, domain_id, rating, category, rationale, confidence, created_by)
  select v_project, d.id, x.rating, x.cat::consensus_category, x.rationale, x.conf::confidence_level, (personas ->> 'pi')::uuid
  from (values
    ('D1', 3, 'substantial', 'Strong historic prioritisation of underserved groups, weakened by 2025 cuts that fell hardest on prevention and key populations.', 'medium'),
    ('D2', 3, 'full', 'Open data and public-system investment, alongside long-standing parallel partner structures.', 'medium'),
    ('D3', 2, 'with_reservations', 'Shared obligations are now written down, but risk has been borne mainly by partner countries and U.S. reciprocal commitments are thin.', 'low'),
    ('D4', 2, 'with_reservations', 'Formal control is shifting to governments, but terms are set by the funder and communities have less say than before.', 'medium'),
    ('D5', 2, 'substantial', 'Community participation was meaningful historically and has weakened sharply since 2024.', 'medium'),
    ('D6', 3, 'full', 'Strong data transparency; weak transparency of decisions and compact terms.', 'medium'),
    ('D7', null, 'no_consensus', 'The panel agrees transition is now explicit and financed, but disagrees on whether its pace and terms build or erode sovereignty. Both positions are archived as dissent.', null),
    ('D8', 2, 'full', 'Long partnership damaged by abrupt, unilateral decisions in 2025.', 'low'),
    ('D9', 3, 'substantial', 'Transformative health outcomes; structural change and independence from external funding remain limited.', 'medium')
  ) as x(code, rating, cat, rationale, conf)
  join public.domains d on d.framework_version_id = fv and d.code = x.code;

  insert into public.dissent_records (project_id, domain_id, member_id, position, rationale, created_by)
  select v_project, d.id, (personas ->> who)::uuid, pos, why, (personas ->> who)::uuid
  from (values
    ('D4','a2','Rating 4 (Strong / Consistent)','Control over money, staff and supply chains is genuinely moving to national governments under the compacts (Kenya framework; GHSP 2023).'),
    ('D7','a1','Rating 2 (Partial / Inconsistent)','A fixed handover timeline after the 2025 shock, in donor-dependent systems, risks service collapse (The Star 2025; IOM 2013).'),
    ('D7','a2','Rating 4 (Strong / Consistent)','Dated, financed transition plans with rising domestic co-investment are the first credible path to sovereignty (UNAIDS 2024; KFF tracker).')
  ) as x(code, who, pos, why)
  join public.domains d on d.framework_version_id = fv and d.code = x.code;

  -- Approval chain (SRS §10.17): reviewer verifies, PI approves, consensus locks
  perform set_config('app.consensus_approval', 'on', true);
  update public.consensus_ratings set reviewer_verified_by = (personas ->> 'rev')::uuid, reviewer_verified_at = '2026-07-30',
    pi_approved_by = (personas ->> 'pi')::uuid, pi_approved_at = '2026-07-31' where project_id = v_project;
  perform set_config('app.consensus_approval', 'off', true);
  update public.assessment_projects set profile_approved_at = '2026-07-31', profile_approved_by = (personas ->> 'pi')::uuid where id = v_project;

  -- Gates G0–G8 (PLAN D-52 order) --------------------------------------------------------------
  for rec in select * from (values
    ('G0', 'pi',  'go',             null, '2026-01-20', null),
    ('G1', 'pi',  'go',             null, '2026-02-10', null),
    ('G2', 'pi',  'go',             null, '2026-05-15', null),
    ('G3', 'pi',  'go',             null, '2026-06-05', '2026-06-03'),
    ('G4', 'rev', 'conditional_go', 'Document how indirect costs of community services and community-led monitoring are covered under the compacts.', '2026-06-25', null),
    ('G5', 'pi',  'go',             null, '2026-07-31', null),
    ('G6', 'pi',  'go',             null, '2026-08-20', '2026-08-18'),
    ('G7', 'kt',  'go',             null, '2026-09-15', null),
    ('G8', 'pi',  'go',             null, '2026-10-02', null)
  ) as g(gate, owner, decision, conditions, decided, verified) loop
    insert into public.gate_reviews (project_id, gate, attempt_number, created_by, created_at)
    values (v_project, rec.gate::gate_code, 1, (personas ->> rec.owner)::uuid, (rec.decided::date - 3)::timestamptz)
    returning id into v_review;
    insert into public.gate_criterion_responses (gate_review_id, criterion_id, answer, note, auto, auto_evidence, created_by)
    select v_review, gc.id, 'yes', case when gc.auto_check_key is null then 'Confirmed by the gate owner (demo).' end,
           gc.auto_check_key is not null, case when gc.auto_check_key is not null then '{}'::jsonb end, (personas ->> rec.owner)::uuid
    from public.gate_criteria gc where gc.framework_version_id = fv and gc.gate = rec.gate::gate_code;
    if rec.verified is not null then
      insert into public.gate_verifications (gate_review_id, verified_by, outcome, notes, created_by, created_at)
      values (v_review, (personas ->> 'rev')::uuid, 'verified', 'Evidence and checks confirmed (demo).', (personas ->> 'rev')::uuid, rec.verified::timestamptz);
    end if;
    update public.gate_reviews set suggested_decision = 'go', suggestion_reasons = '{}', owner_decision = rec.decision::gate_decision,
      conditions = rec.conditions, decided_by = (personas ->> rec.owner)::uuid, decided_at = rec.decided::timestamptz
    where id = v_review;
    if rec.gate = 'G4' then v_g4_review := v_review; end if;
  end loop;

  -- T8 / G6: member-checks and the approved report narrative ------------------------------------
  insert into public.member_checks (project_id, stakeholder_group, response, relevance, checked_on, created_by) values
    (v_project, 'Network of people living with HIV (illustrative member-check)', 'The profile reflects our experience, especially D5 and D8; it should say more about clinic-level effects of the 2025 cuts.', 4, '2026-08-05', (personas ->> 'pi')::uuid),
    (v_project, 'Community-led monitoring volunteers (illustrative member-check)', 'Recognisable findings; we disagree that D6 is moderate while monitoring funding has ended.', 3, '2026-08-07', (personas ->> 'pi')::uuid);

  insert into public.report_drafts (project_id, body, produced_by, approved_by, approved_at, created_by)
  values (v_project,
'DEMO PROFILE — illustrative assessment for training, built from public sources. Not an official evaluation of PEPFAR.

Subject: PEPFAR in sub-Saharan Africa (programme, multi-country).
This profile informs the decision: whether partner governments and funders should adopt the proposed 2026–2030 transition of national HIV programmes under the bilateral health compacts, and which safeguards to require.

Domain profile (each domain is rated on its own; ratings are not combined):
- D1 Equity & Justice: 3 – Moderate / Developing, medium confidence.
- D2 Common Good Orientation: 3 – Moderate / Developing, medium confidence.
- D3 Mutual Responsibility: 2 – Partial / Inconsistent, low confidence.
- D4 Power Transformation: 2 – Partial / Inconsistent, medium confidence (dissent recorded).
- D5 Inclusive Participation: 2 – Partial / Inconsistent, medium confidence.
- D6 Transparency & Accountability: 3 – Moderate / Developing, medium confidence.
- D7 Sustainability & Sovereignty: not rated (no consensus; both positions archived).
- D8 Relational Trust: 2 – Partial / Inconsistent, low confidence.
- D9 Transformative Impact: 3 – Moderate / Developing, medium confidence.

Integrity: power imbalance and sustainability flagged High; solidarity washing and inclusion gap Medium. Solidarity type: primarily instrumental, secondarily substantive.

Limitations and confidence caveats:
- Multi-country subject: conditions differ by country; narratives cite country examples (Kenya, South Africa, Nigeria) rather than averages.
- Co-financing compliance under the 2026 compacts is not yet public (affects D3 and D7).
- No systematic partner-perception survey after the 2025 disruptions (affects D8).
- Not all compact texts are public (affects D2 and D6).

Recommended actions:
- Publish annual co-financing and compact implementation reports per country.
- Protect community-led monitoring through domestic or multilateral funding.
- Give communities a formal seat in compact reviews.',
    'human', (personas ->> 'pi')::uuid, '2026-08-19', (personas ->> 'pi')::uuid);

  -- T9 / G7: knowledge translation and uptake (illustrative) --------------------------------------
  insert into public.kt_products (project_id, audience, format, delivered_to, delivered_on, created_by) values
    (v_project, 'National HIV programme steering committee (illustrative)', 'Policy brief and dialogue', 'Chair, national HIV programme steering committee (illustrative)', '2026-09-02', (personas ->> 'kt')::uuid),
    (v_project, 'Networks of people living with HIV (illustrative)', 'Plain-language community summary', 'PLHIV network coordinators (illustrative)', '2026-09-04', (personas ->> 'kt')::uuid);

  insert into public.decision_responses (project_id, response_type, summary, follow_up_on, created_by)
  values (v_project, 'action_plan', 'The steering committee (illustrative) agreed three actions: publish co-financing reports, fund community-led monitoring from the domestic budget, and add a community seat to the compact review.', '2026-09-30', (personas ->> 'kt')::uuid);

  insert into public.action_items (project_id, description, owner_id, due_on, status, source_gate_review_id, created_by) values
    (v_project, 'Document how indirect costs of community services and community-led monitoring are covered under the compacts.', (personas ->> 'pi')::uuid, '2026-07-10', 'done', v_g4_review, (personas ->> 'rev')::uuid),
    (v_project, 'Publish annual co-financing and compact implementation reports (illustrative commitment).', (personas ->> 'kt')::uuid, '2026-12-31', 'open', null, (personas ->> 'kt')::uuid),
    (v_project, 'Fund community-led monitoring from the domestic budget (illustrative commitment).', (personas ->> 'kt')::uuid, '2027-03-31', 'open', null, (personas ->> 'kt')::uuid),
    (v_project, 'Add a community seat to the compact review committee (illustrative commitment).', (personas ->> 'pi')::uuid, '2026-11-30', 'done', null, (personas ->> 'kt')::uuid);

  insert into public.uptake_events (project_id, event_date, decision_body, use_type, evidence_link, created_by) values
    (v_project, '2026-09-10', 'National HIV programme steering committee (illustrative)', 'conceptual', null, (personas ->> 'kt')::uuid),
    (v_project, '2026-09-24', 'Compact implementation review meeting (illustrative)', 'instrumental', null, (personas ->> 'kt')::uuid);

  -- T7: anticipatory signals (observations only; invariant 10) ---------------------------------------
  insert into public.signal_observations (subject_id, project_id, domain_id, observed_on, source, description, level, reviewed_at, created_by)
  select v_subject, v_project, d.id, x.obs::date, x.src, x.descr, x.lvl::signal_level, x.rev::timestamptz, (personas ->> x.who)::uuid
  from (values
    ('D4', '2026-02-05', 'Global Policy Journal (Evaborhene)', 'Analysis reports compact terms tracking strategic alignment, with civil society challenging Kenya’s framework in court.', 'watch', '2026-02-20', 'a1'),
    ('D7', '2026-10-08', 'KFF MOU tracker', 'Signed compacts reduce U.S. funding by 34% against historical levels while partner co-investment rises to 39%.', 'act', '2026-10-09', 'kt'),
    ('D5', '2026-05-15', 'Spotlight / Ritshidze state-of-health report', 'Community-led monitoring continues only with temporary support; accountability meetings remain paused.', 'act', '2026-05-30', 'a2')
  ) as x(code, obs, src, descr, lvl, rev, who)
  join public.domains d on d.framework_version_id = fv and d.code = x.code;

  -- T10 / G8: follow-up, reassessment decision, lessons -------------------------------------------------
  insert into public.follow_up_reviews (project_id, reviewed_on, notes, reassessment_decision, created_by)
  values (v_project, '2026-10-01', 'Two of four actions done (indirect-cost documentation, community seat). Co-financing reporting and domestic funding for community-led monitoring are pending. Signals on D5 and D7 marked Act. Reassessment recommended once 2026 compact budget execution is published.', 'reassess', (personas ->> 'pi')::uuid);

  insert into public.framework_lessons (project_id, framework_version_id, lesson, created_by) values
    (v_project, fv, 'Add co-financing compliance prompts to D3 and D7 for compact-funded programmes.', (personas ->> 'pi')::uuid),
    (v_project, fv, 'Give guidance for multi-country subjects: document country heterogeneity in narratives rather than rating a regional average.', (personas ->> 'pi')::uuid);

  -- Complete cycle: closed after G8 (read-only demo) ------------------------------------------------
  update public.assessment_projects set status = 'closed',
    closed_reason = 'Demo cycle complete: all gates G0–G8 passed; reassessment recommended once 2026 compact budget execution is published.'
  where id = v_project;

  perform set_config('app.demo_seed', 'off', true);
end;
$$;
