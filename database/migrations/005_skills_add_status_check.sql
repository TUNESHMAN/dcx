
create table if not exists dcx.skills__new (
  skill_id text primary key,
  name text not null,
  name_lower text not null unique,
  category text not null,
  status text not null check (status in ('active', 'deprecated')),
  aliases text not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

update dcx.skills
set status = 'active'
where status not in ('active', 'deprecated');

insert into dcx.skills__new (
  skill_id, name, name_lower, category, status, aliases, created_at, updated_at
)
select
  skill_id, name, name_lower, category, status, aliases, created_at, updated_at
from dcx.skills;


drop table dcx.skills;

alter table dcx.skills__new rename to skills;
