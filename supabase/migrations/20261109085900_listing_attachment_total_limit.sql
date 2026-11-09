-- Keep the existing authorization/serialization lock and enforce one combined limit.
create or replace function private.validate_listing_attachment()
returns trigger language plpgsql security definer set search_path=''
as $$ declare info jsonb; count_existing integer; begin
  if not private.lock_attachment_listing(new.listing_id) then
    raise exception 'Attachment permission denied' using errcode='42501';
  end if;
  select metadata into info from storage.objects
    where bucket_id='listing-attachments' and name=new.storage_path;
  if info is null then
    raise exception 'Upload the attachment before creating metadata' using errcode='23514';
  end if;
  new.uploaded_by=auth.uid(); new.created_at=clock_timestamp();
  new.mime_type=info->>'mimetype'; new.size_bytes=(info->>'size')::bigint;
  select count(*) into count_existing from public.listing_attachments where listing_id=new.listing_id;
  if count_existing>=5 then
    raise exception 'Maximum five attachments total per listing, including images and PDFs' using errcode='23514';
  end if;
  return new;
end; $$;

