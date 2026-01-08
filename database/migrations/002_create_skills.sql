create table dcx.skills (
  skill_id text primary key,
  name text not null unique,
  name_lower text not null unique,
  category text not null,
  status text not null,
  aliases text not null default '[]', 
  created_at timestamptz not null,
  updated_at timestamptz not null
);
