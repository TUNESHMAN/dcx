create table if not exists dcx.skills (
  skill_id text primary key,
  name text not null,
  name_lower text not null unique,
  category text not null,
  status text not null check (status in ('active', 'deprecated')),
  aliases text not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index async if not exists skills_category_idx
  on dcx.skills (category);

create index async if not exists skills_status_idx
  on dcx.skills (status);

create index async if not exists skills_name_lower_idx
  on dcx.skills (name_lower);
