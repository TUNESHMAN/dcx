create table if not exists dcx.consultancies (
  consultancy_id text primary key,
  name text not null,
  name_canonical text not null,
  about_us text not null default '',
  website text not null default '',
  country text not null,
  city text not null default '',
  region text not null default '',
  timezone text not null default '',
  status text not null check (status in ('active', 'disabled')) default 'active',
  logo_key text null,
  logo_url text null,
  logo_content_type text null,
  logo_updated_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists dcx.consultancy_specialty_skills (
  consultancy_id text not null,
  skill_id text not null,
  created_at timestamptz not null,
  primary key (consultancy_id, skill_id)
);
