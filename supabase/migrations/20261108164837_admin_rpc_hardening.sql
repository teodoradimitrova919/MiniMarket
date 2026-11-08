-- Public RPC wrappers run as callers; elevated implementations stay unexposed.
alter function public.admin_set_role(uuid,public.app_role) set schema private;
alter function public.admin_overview() set schema private;
alter function public.admin_user_summaries(uuid[]) set schema private;
alter function public.admin_user_impact(uuid) set schema private;
alter function public.admin_begin_user_deletion(uuid) set schema private;
alter function public.begin_listing_deletion(uuid) set schema private;
create function public.admin_set_role(target uuid,desired public.app_role) returns void
language sql security invoker set search_path='' as $$ select private.admin_set_role(target,desired); $$;
create function public.admin_overview() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.admin_overview(); $$;
create function public.admin_user_summaries(ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.admin_user_summaries(ids); $$;
create function public.admin_user_impact(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.admin_user_impact(target); $$;
create function public.admin_begin_user_deletion(target uuid) returns void
language sql security invoker set search_path='' as $$ select private.admin_begin_user_deletion(target); $$;
create function public.begin_listing_deletion(target uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.begin_listing_deletion(target); $$;
revoke all on function public.admin_set_role(uuid,public.app_role),public.admin_overview(),public.admin_user_summaries(uuid[]),
public.admin_user_impact(uuid),public.admin_begin_user_deletion(uuid),public.begin_listing_deletion(uuid) from public,anon,authenticated;
grant execute on function public.admin_set_role(uuid,public.app_role),public.admin_overview(),public.admin_user_summaries(uuid[]),
public.admin_user_impact(uuid),public.admin_begin_user_deletion(uuid),public.begin_listing_deletion(uuid) to authenticated;
create policy user_deletions_deny_clients on private.user_deletions for all to authenticated using(false) with check(false);
create policy listing_deletions_deny_clients on private.listing_deletions for all to authenticated using(false) with check(false);
