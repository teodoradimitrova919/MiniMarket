-- Private file objects; public metadata/signing follows the parent listing's SELECT policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-attachments','listing-attachments',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;

create table public.listing_attachments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  storage_path text not null unique,
  original_filename text not null check(length(btrim(original_filename)) between 1 and 255 and original_filename !~ '[[:cntrl:]]'),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check(size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  constraint attachment_path_matches_record check(storage_path=listing_id::text || '/' || id::text ||
    case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.pdf' end)
);
create index listing_attachments_listing_idx on public.listing_attachments(listing_id,created_at,id);
create index listing_attachments_uploader_idx on public.listing_attachments(uploaded_by);
create table private.attachment_deletions (
  attachment_id uuid primary key references public.listing_attachments(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table public.listing_attachments enable row level security;
alter table private.attachment_deletions enable row level security;
revoke all on public.listing_attachments,private.attachment_deletions from public,anon,authenticated;
grant select on public.listing_attachments to anon,authenticated;
grant insert,delete on public.listing_attachments to authenticated;
grant all on public.listing_attachments,private.attachment_deletions to service_role;
create policy attachment_deletions_deny_clients on private.attachment_deletions for all to authenticated using(false) with check(false);

create function private.can_manage_listing_attachments(target uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.is_active_user(auth.uid()) and exists(select 1 from public.listings l where l.id=target
  and private.listing_writable(l.id,l.owner_id) and (l.owner_id=auth.uid() or private.is_admin())); $$;
create function private.lock_attachment_listing(target uuid)
returns boolean language plpgsql volatile security definer set search_path=''
as $$ declare owner uuid; begin
  select owner_id into owner from public.listings where id=target;
  if owner is null then return false; end if;
  -- Match existing user/listing deletion lock order and serialize attachment limits.
  perform 1 from auth.users where id=owner for share;
  perform 1 from public.listings where id=target for update;
  return private.can_manage_listing_attachments(target);
end; $$;
create function private.attachment_path_listing(object_name text)
returns uuid language sql immutable security invoker set search_path=''
as $$ select case when object_name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
  then split_part(object_name,'/',1)::uuid else null end; $$;
create function private.can_remove_attachment_object(object_name text)
returns boolean language plpgsql volatile security definer set search_path=''
as $$ begin
  if not private.lock_attachment_listing(private.attachment_path_listing(object_name)) then return false; end if;
  -- Orphan cleanup cannot race with metadata registration and delete a newly attached file.
  return not exists(select 1 from public.listing_attachments where storage_path=object_name)
    or exists(select 1 from public.listing_attachments a join private.attachment_deletions d on d.attachment_id=a.id where a.storage_path=object_name);
end; $$;
create policy listing_attachments_read on public.listing_attachments for select to anon,authenticated
using(exists(select 1 from public.listings l where l.id=listing_id));
create policy listing_attachments_insert on public.listing_attachments for insert to authenticated
with check(uploaded_by=(select auth.uid()) and private.can_manage_listing_attachments(listing_id));
create policy listing_attachments_delete on public.listing_attachments for delete to authenticated
using(private.can_manage_listing_attachments(listing_id));
create policy listing_attachment_objects_read_manager on storage.objects for select to authenticated
using(bucket_id='listing-attachments' and private.can_manage_listing_attachments(private.attachment_path_listing(name)));
create policy listing_attachment_objects_insert on storage.objects for insert to authenticated
with check(bucket_id='listing-attachments' and private.lock_attachment_listing(private.attachment_path_listing(name)));
create policy listing_attachment_objects_delete on storage.objects for delete to authenticated
using(bucket_id='listing-attachments' and private.can_remove_attachment_object(name));
-- No object UPDATE policy: uploads use unique immutable paths, never overwrite.

create function private.validate_listing_attachment()
returns trigger language plpgsql security definer set search_path=''
as $$ declare info jsonb; count_existing integer; begin
  if not private.lock_attachment_listing(new.listing_id) then raise exception 'Attachment permission denied' using errcode='42501'; end if;
  select metadata into info from storage.objects where bucket_id='listing-attachments' and name=new.storage_path;
  if info is null then raise exception 'Upload the attachment before creating metadata' using errcode='23514'; end if;
  -- Storage, not caller-supplied metadata, determines actual size/type and identity.
  new.uploaded_by=auth.uid(); new.created_at=clock_timestamp();
  new.mime_type=info->>'mimetype'; new.size_bytes=(info->>'size')::bigint;
  select count(*) into count_existing from public.listing_attachments where listing_id=new.listing_id
    and (mime_type='application/pdf')=(new.mime_type='application/pdf');
  if count_existing>=5 then raise exception 'Maximum five images and five PDF documents per listing' using errcode='23514'; end if;
  return new;
end; $$;
create trigger listing_attachments_validate before insert on public.listing_attachments for each row execute function private.validate_listing_attachment();
create function private.require_attachment_file_cleanup()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if exists(select 1 from storage.objects where bucket_id='listing-attachments' and name=old.storage_path) then
    raise exception 'Remove the Storage file before attachment metadata' using errcode='PT409';
  end if;
  return old;
end; $$;
create trigger listing_attachments_cleanup_guard before delete on public.listing_attachments for each row execute function private.require_attachment_file_cleanup();
create function private.require_listing_attachment_cleanup()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if exists(select 1 from storage.objects where bucket_id='listing-attachments' and name like old.id::text || '/%') then
    raise exception 'Attachment Storage cleanup is required before listing deletion' using errcode='PT409';
  end if;
  return old;
end; $$;
create trigger listings_attachment_cleanup_guard before delete on public.listings for each row execute function private.require_listing_attachment_cleanup();

create function private.begin_attachment_deletion(target uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare parent uuid; begin
  select listing_id into parent from public.listing_attachments where id=target;
  if parent is null or not private.lock_attachment_listing(parent) then raise exception 'Attachment unavailable or permission denied' using errcode='42501'; end if;
  perform 1 from public.listing_attachments where id=target for update;
  insert into private.attachment_deletions(attachment_id) values(target) on conflict do nothing;
end; $$;
create function public.begin_attachment_deletion(target uuid) returns void language sql security invoker set search_path=''
as $$ select private.begin_attachment_deletion(target); $$;

-- Extend only the existing, related deletion-impact operation.
create or replace function private.admin_user_impact(target uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  return jsonb_build_object('listings',(select count(*) from public.listings where owner_id=target),
    'images',(select count(*) from storage.objects where bucket_id='listing-images' and split_part(name,'/',1)=target::text)
      +(select count(*) from storage.objects o join public.listings l on l.id::text=split_part(o.name,'/',1) where o.bucket_id='listing-attachments' and l.owner_id=target and o.metadata->>'mimetype' like 'image/%'),
    'documents',(select count(*) from public.listing_attachments a join public.listings l on l.id=a.listing_id where l.owner_id=target and a.mime_type='application/pdf'),
    'attachments',(select count(*) from public.listing_attachments a join public.listings l on l.id=a.listing_id where l.owner_id=target),
    'ownFavorites',(select count(*) from public.favorites where user_id=target),
    'listingFavorites',(select count(*) from public.favorites f join public.listings l on l.id=f.listing_id where l.owner_id=target),
    'deletionPending',exists(select 1 from private.user_deletions where user_id=target));
end; $$;
revoke all on function private.can_manage_listing_attachments(uuid),private.lock_attachment_listing(uuid),private.attachment_path_listing(text),
  private.can_remove_attachment_object(text),private.validate_listing_attachment(),private.require_attachment_file_cleanup(),
  private.require_listing_attachment_cleanup(),private.begin_attachment_deletion(uuid),public.begin_attachment_deletion(uuid) from public,anon,authenticated;
grant execute on function private.can_manage_listing_attachments(uuid),private.lock_attachment_listing(uuid),private.attachment_path_listing(text),
  private.can_remove_attachment_object(text),private.begin_attachment_deletion(uuid),public.begin_attachment_deletion(uuid) to authenticated;

