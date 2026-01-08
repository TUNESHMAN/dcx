alter table dcx.consultancies add column if not exists logo_key text;
alter table dcx.consultancies add column if not exists logo_url text;
alter table dcx.consultancies add column if not exists logo_content_type text;
alter table dcx.consultancies add column if not exists logo_updated_at timestamptz;
