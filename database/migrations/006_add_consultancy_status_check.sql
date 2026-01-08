alter table dcx.consultancies
add constraint consultancies_status_check
check (status in ('active', 'disabled'));
