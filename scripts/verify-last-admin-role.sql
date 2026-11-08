-- Trusted SQL/MCP verification only. No Auth account creation or permanent role changes.
begin;
do $$
declare sole uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(73402191);
  if (select count(*) from public.user_roles where role='admin' and private.is_active_user(user_id))<>1 then
    perform set_config('minimarket.role_guard_test','SKIP: requires exactly one active administrator; no roles changed',true);
    return;
  end if;
  select user_id into sole from public.user_roles where role='admin' and private.is_active_user(user_id);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',sole,'role','authenticated')::text,true);
  begin
    perform public.admin_set_role(sole,'user');
    raise exception 'Last administrator demotion was incorrectly allowed';
  exception when check_violation then null;
  end;
  assert exists(select 1 from public.user_roles where user_id=sole and role='admin');
  perform set_config('minimarket.role_guard_test','PASS: last-administrator demotion rejected',true);
end $$;
select current_setting('minimarket.role_guard_test') as verification;
rollback;
