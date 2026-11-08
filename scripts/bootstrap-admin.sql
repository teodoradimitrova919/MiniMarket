-- Run only through a trusted SQL connection (psql), never a browser or public RPC.
-- psql "<trusted database connection>" -v admin_user_id='<explicit user UUID>' -f scripts/bootstrap-admin.sql
\set ON_ERROR_STOP on
begin;
insert into public.user_roles(user_id,role) values(:'admin_user_id'::uuid,'admin')
on conflict(user_id) do update set role=excluded.role;
commit;
