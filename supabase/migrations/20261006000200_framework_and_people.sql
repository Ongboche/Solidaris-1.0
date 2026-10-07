-- Versioned framework configuration (invariant 9) and people.

create table public.framework_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  label text not null unique,
  status framework_status not null default 'draft',
  published_at timestamptz
);

create table public.dimensions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  framework_version_id uuid not null references public.framework_versions (id),
  code text not null,
  label text not null,
  sub_label text,
  color_token text not null,
  sort int not null,
  unique (framework_version_id, code)
);

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  framework_version_id uuid not null references public.framework_versions (id),
  dimension_id uuid not null references public.dimensions (id),
  code text not null,
  name text not null,
  key_question text,
  evidence_to_look_for text,
  red_flags text,
  sort int not null,
  unique (framework_version_id, code)
);

create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  domain_id uuid not null references public.domains (id),
  sort int not null,
  prompt text not null,
  guidance text,
  example text,
  -- null = applies to every subject type (brief §8)
  subject_types subject_type[],
  unique (domain_id, sort)
);

create table public.rating_levels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  framework_version_id uuid not null references public.framework_versions (id),
  value smallint not null check (value between 1 and 5),
  label text not null,
  descriptor text,
  unique (framework_version_id, value)
);

create table public.signal_definitions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  domain_id uuid not null references public.domains (id),
  description text not null
);

create table public.gate_criteria (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  framework_version_id uuid not null references public.framework_versions (id),
  gate gate_code not null,
  sort int not null,
  text text not null,
  required boolean not null,
  -- names an evaluator in src/domain/autoChecks.ts and its SQL twin; null = manual
  auto_check_key text,
  unique (framework_version_id, gate, sort)
);

-- Open decisions from brief §16, kept as configuration.
create table public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create function public.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = p_key), p_default)
$$;

create function public.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), p_default)
$$;

-- People -----------------------------------------------------------------

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  name text not null,
  country text,
  type text
);

-- One row per auth user. No password column: Supabase Auth owns credentials.
create table public.profiles (
  id uuid primary key references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text,
  email text,
  institution_id uuid references public.institutions (id),
  institution_name text,
  position text,
  country text,
  discipline text,
  orcid text,
  platform_role platform_role not null default 'member',
  -- Consent (PLAN D-8): processing + handling required, email optional
  consent_processing_at timestamptz,
  consent_handling_at timestamptz,
  consent_email_at timestamptz,
  consent_notice_version text,
  deleted_at timestamptz,
  anonymised_at timestamptz
);

-- Self-registration always creates a plain member (brief §7, PLAN D-25).
-- Any role sent in metadata is ignored. Consent comes from the sign-up form;
-- OAuth sign-ups carry none and are routed to the consent screen.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  consented boolean := coalesce((meta ->> 'consent_processing')::boolean, false)
                       and coalesce((meta ->> 'consent_handling')::boolean, false);
begin
  insert into public.profiles (id, email, full_name, institution_name, position, country, discipline,
                               consent_processing_at, consent_handling_at, consent_email_at, consent_notice_version)
  values (
    new.id,
    new.email,
    coalesce(meta ->> 'full_name', meta ->> 'name'),
    meta ->> 'institution_name',
    meta ->> 'position',
    meta ->> 'country',
    meta ->> 'discipline',
    case when consented then now() end,
    case when consented then now() end,
    case when consented and coalesce((meta ->> 'consent_email')::boolean, false) then now() end,
    case when consented then meta ->> 'consent_notice_version' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
