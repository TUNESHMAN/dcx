create table if not exists dcx.consultants (
  consultant_id text primary key,
  consultancy_id text not null,
  full_name text not null,
  title text not null default '',
  day_rate text not null default '',
  seniority text not null check (seniority in ('junior', 'mid', 'senior')), 
  availability_status text not null
    check (availability_status in ('available_now', 'available_from'))
    default 'available_now',
  available_from date null,
  country text not null,
  city text not null default '',
  willing_to_travel boolean not null default false,
  status text not null check (status in ('active', 'archived')) default 'active',
  last_refreshed_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists dcx.consultant_skills (
  consultant_id text not null,
  skill_id text not null,
  created_at timestamptz not null,
  primary key (consultant_id, skill_id)
);

create index async if not exists consultants_by_consultancy_idx
  on dcx.consultants (consultancy_id);

create index async if not exists consultants_status_idx
  on dcx.consultants (status);

create index async if not exists consultants_availability_idx
  on dcx.consultants (availability_status, available_from);

create index async if not exists consultants_location_idx
  on dcx.consultants (country, city);

create index async if not exists consultant_skills_skill_idx
  on dcx.consultant_skills (skill_id);
