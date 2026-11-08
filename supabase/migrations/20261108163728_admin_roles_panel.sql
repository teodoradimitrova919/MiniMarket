-- MiniMarket admin roles. Existing marketplace rows and public reads are preserved.
create type public.app_role as enum ('user', 'admin');
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);
-- Private retry markers freeze writes during multi-service Storage/Auth cleanup.
create table private.user_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
create table private.listing_deletions (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
alter table private.user_deletions enable row level security;
alter table private.listing_deletions enable row level security;
revoke all on public.user_roles, private.user_deletions, private.listing_deletions from public, anon, authenticated;
grant select on public.user_roles to authenticated;
grant all on public.user_roles, private.user_deletions, private.listing_deletions to service_role;

insert into public.profiles(id, username, role)
select u.id, coalesce(nullif(btrim(u.raw_user_meta_data->>'username'),''), 'user_' || replace(u.id::text,'-','')), 'user'
from auth.users u on conflict(id) do nothing;
insert into public.user_roles(user_id, role)
select u.id, case when p.role='admin' then 'admin'::public.app_role else 'user'::public.app_role end
from auth.users u left join public.profiles p on p.id=u.id on conflict(user_id) do nothing;

create or replace function private.is_active_user(target uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select target is not null and not exists(select 1 from private.user_deletions where user_id=target); $$;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.user_roles where user_id=(select auth.uid()) and role='admin')
  and private.is_active_user((select auth.uid())); $$;
create policy user_roles_read on public.user_roles for select to authenticated
using ((user_id=(select auth.uid()) and (select private.is_active_user(auth.uid()))) or (select private.is_admin()));

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  insert into public.profiles(id,username,role) values(new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'username'),''),'user_' || replace(new.id::text,'-','')), 'user');
  insert into public.user_roles(user_id,role) values(new.id,'user');
  return new;
end; $$;
create function private.guard_role_change()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  -- One lock serializes demotions and deletion reservations, including concurrent admins.
  perform pg_catalog.pg_advisory_xact_lock(73402191);
  if old.role='admin' and (tg_op='DELETE' or new.role<>'admin') and not exists(
    select 1 from public.user_roles r where r.role='admin' and r.user_id<>old.user_id
    and not exists(select 1 from private.user_deletions d where d.user_id=r.user_id)
  ) then raise exception 'The last administrator cannot be removed' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.user_id<>old.user_id then raise exception 'Role ownership is immutable' using errcode='23514'; end if;
  return new;
end; $$;
create trigger user_roles_guard before update or delete on public.user_roles for each row execute function private.guard_role_change();
create function private.mirror_role()
returns trigger language plpgsql security definer set search_path=''
as $$ begin update public.profiles set role=new.role::text where id=new.user_id; return new; end; $$;
create trigger user_roles_mirror after insert or update on public.user_roles for each row execute function private.mirror_role();

create function public.admin_set_role(target uuid, desired public.app_role)
returns void language plpgsql security definer set search_path=''
as $$ begin
  perform pg_catalog.pg_advisory_xact_lock(73402191);
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if not private.is_active_user(target) then raise exception 'User deletion is pending' using errcode='23514'; end if;
  insert into public.user_roles(user_id,role) values(target,desired) on conflict(user_id) do update set role=excluded.role;
end; $$;

-- Prevent mutation of frozen accounts/listings and changing listing ownership.
create function private.listing_writable(target uuid, owner uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.is_active_user(owner) and not exists(select 1 from private.listing_deletions where listing_id=target); $$;
drop policy listings_insert on public.listings;
drop policy listings_update on public.listings;
drop policy listings_delete on public.listings;
create policy listings_insert on public.listings for insert to authenticated
with check ((select private.is_active_user(auth.uid())) and private.is_active_user(owner_id) and (owner_id=(select auth.uid()) or (select private.is_admin())));
create policy listings_update on public.listings for update to authenticated
using ((select private.is_active_user(auth.uid())) and private.listing_writable(id,owner_id) and (owner_id=(select auth.uid()) or (select private.is_admin())))
with check ((select private.is_active_user(auth.uid())) and private.listing_writable(id,owner_id) and (owner_id=(select auth.uid()) or (select private.is_admin())));
create policy listings_delete on public.listings for delete to authenticated
using ((select private.is_active_user(auth.uid())) and private.listing_writable(id,owner_id) and (owner_id=(select auth.uid()) or (select private.is_admin())));
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using (id=(select auth.uid()) and (select private.is_active_user(auth.uid()))) with check(id=(select auth.uid()) and (select private.is_active_user(auth.uid())));
drop policy favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites for insert to authenticated
with check(user_id=(select auth.uid()) and (select private.is_active_user(auth.uid())));
-- Existing categories policies call private.is_admin() and now use authoritative roles.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-images','listing-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create function private.can_write_listing_image(object_name text)
returns boolean language plpgsql volatile security definer set search_path=''
as $$ declare owner uuid; listing uuid; begin
  select owner_id,id into owner,listing from public.listings
  where owner_id::text=split_part(object_name,'/',1) and id::text=split_part(object_name,'/',2);
  if owner is null or array_length(string_to_array(object_name,'/'),1)<>3 then return false; end if;
  -- Serialize metadata writes with user/listing deletion reservations.
  perform 1 from auth.users where id=owner for share;
  perform 1 from public.listings where id=listing for share;
  return private.is_active_user(auth.uid()) and private.listing_writable(listing,owner)
    and (owner=auth.uid() or private.is_admin());
end; $$;
create policy listing_images_read on storage.objects for select to anon,authenticated using(bucket_id='listing-images');
create policy listing_images_insert on storage.objects for insert to authenticated
with check(bucket_id='listing-images' and private.can_write_listing_image(name));
create policy listing_images_delete_unused on storage.objects for delete to authenticated
using(bucket_id='listing-images' and private.can_write_listing_image(name) and not exists(
  select 1 from public.listings l where l.image_url like '%/storage/v1/object/public/listing-images/' || name
));

create function private.guard_listing_integrity()
returns trigger language plpgsql security definer set search_path=''
as $$ declare object_name text; begin
  if tg_op='DELETE' then
    if exists(select 1 from storage.objects where bucket_id='listing-images' and name like old.owner_id::text || '/' || old.id::text || '/%') then
      raise exception 'Storage cleanup is required before deletion' using errcode='PT409';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and new.owner_id<>old.owner_id then raise exception 'Listing ownership cannot change' using errcode='23514'; end if;
  if new.image_url is not null and (tg_op='INSERT' or new.image_url is distinct from old.image_url) then
    object_name=substring(new.image_url from '/storage/v1/object/public/listing-images/(.*)$');
    if object_name is null or split_part(object_name,'/',1)<>new.owner_id::text or split_part(object_name,'/',2)<>new.id::text
      or not exists(select 1 from storage.objects where bucket_id='listing-images' and name=object_name) then
      raise exception 'Use an uploaded image belonging to this listing' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
create trigger listings_integrity before insert or update or delete on public.listings for each row execute function private.guard_listing_integrity();

create function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  return jsonb_build_object('totalListings',(select count(*) from public.listings),
    'totalCategories',(select count(*) from public.categories),'totalUsers',(select count(*) from auth.users));
end; $$;
create function public.admin_user_summaries(ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if coalesce(array_length(ids,1),0)>100 then raise exception 'Too many users' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'role',r.role,
    'listingCount',(select count(*) from public.listings l where l.owner_id=p.id),
    'deletionPending',exists(select 1 from private.user_deletions d where d.user_id=p.id)))
    from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=any(ids)),'[]'::jsonb);
end; $$;
create function public.admin_user_impact(target uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  return jsonb_build_object('listings',(select count(*) from public.listings where owner_id=target),
    'images',(select count(*) from storage.objects where bucket_id='listing-images' and split_part(name,'/',1)=target::text),
    'ownFavorites',(select count(*) from public.favorites where user_id=target),
    'listingFavorites',(select count(*) from public.favorites f join public.listings l on l.id=f.listing_id where l.owner_id=target),
    'deletionPending',exists(select 1 from private.user_deletions where user_id=target));
end; $$;
create function public.admin_begin_user_deletion(target uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
  perform pg_catalog.pg_advisory_xact_lock(73402191);
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if target=auth.uid() then raise exception 'Self deletion is unavailable in the Admin Panel' using errcode='23514'; end if;
  perform 1 from auth.users where id=target for update;
  if not found then raise exception 'User not found' using errcode='P0002'; end if;
  if exists(select 1 from public.user_roles where user_id=target and role='admin') and not exists(
    select 1 from public.user_roles r where role='admin' and user_id<>target and private.is_active_user(user_id)
  ) then raise exception 'The last administrator cannot be deleted' using errcode='23514'; end if;
  insert into private.user_deletions(user_id) values(target) on conflict do nothing;
end; $$;
create function public.begin_listing_deletion(target uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare item public.listings; begin
  select * into item from public.listings where id=target;
  if item.id is null then raise exception 'Listing not found' using errcode='P0002'; end if;
  -- Same lock order as Storage: owner first, then listing.
  perform 1 from auth.users where id=item.owner_id for share;
  select * into item from public.listings where id=target for update;
  if not private.is_active_user(auth.uid()) or not (item.owner_id=auth.uid() or private.is_admin()) then
    raise exception 'Permission denied' using errcode='42501'; end if;
  insert into private.listing_deletions(listing_id) values(target) on conflict do nothing;
  return jsonb_build_object('id',item.id,'owner_id',item.owner_id);
end; $$;

-- Explicit function ACLs: no anonymous RPCs or trigger/helper execution.
revoke all on function private.is_active_user(uuid),private.listing_writable(uuid,uuid),private.can_write_listing_image(text),
  private.guard_role_change(),private.mirror_role(),private.guard_listing_integrity() from public,anon,authenticated;
grant execute on function private.is_active_user(uuid),private.listing_writable(uuid,uuid),private.can_write_listing_image(text) to authenticated;
revoke all on function public.admin_set_role(uuid,public.app_role),public.admin_overview(),public.admin_user_summaries(uuid[]),
  public.admin_user_impact(uuid),public.admin_begin_user_deletion(uuid),public.begin_listing_deletion(uuid) from public,anon,authenticated;
grant execute on function public.admin_set_role(uuid,public.app_role),public.admin_overview(),public.admin_user_summaries(uuid[]),
  public.admin_user_impact(uuid),public.admin_begin_user_deletion(uuid),public.begin_listing_deletion(uuid) to authenticated;
