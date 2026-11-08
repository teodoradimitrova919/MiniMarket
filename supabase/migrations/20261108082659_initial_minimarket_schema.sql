-- Initial MiniMarket schema. No sample data.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (length(btrim(username)) > 0),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  description text,
  price numeric(12,2) not null check (price >= 0 and price <> 'NaN'::numeric),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_user_listing_key unique (user_id, listing_id)
);
create index listings_owner_id_idx on public.listings(owner_id);
create index listings_category_id_idx on public.listings(category_id);
-- The unique favorites index already covers user_id as its leading column.
create index favorites_listing_id_idx on public.favorites(listing_id);

-- Internal role lookup avoids recursive profiles RLS. No user-supplied ID.
create function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- Trigger-only elevated access: metadata provides a name, never a role.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, role)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
                          'user_' || replace(new.id::text, '-', '')), 'user');
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger minimarket_auth_user_created
  after insert on auth.users for each row execute function private.handle_new_user();

create function private.set_listing_updated_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
revoke all on function private.set_listing_updated_at() from public, anon, authenticated;
create trigger listings_set_updated_at
  before update on public.listings for each row execute function private.set_listing_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.favorites enable row level security;

-- Reset platform defaults; profile updates are limited to username only.
revoke all on public.profiles, public.categories, public.listings, public.favorites from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
grant select on public.categories, public.listings to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.listings to authenticated;
grant select, insert, delete on public.favorites to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy categories_insert_admin on public.categories for insert to authenticated
  with check ((select private.is_admin()));
create policy categories_update_admin on public.categories for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy categories_delete_admin on public.categories for delete to authenticated
  using ((select private.is_admin()));

create policy listings_read on public.listings for select to anon, authenticated using (true);
create policy listings_insert on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()) or (select private.is_admin()));
create policy listings_update on public.listings for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()))
  with check (owner_id = (select auth.uid()) or (select private.is_admin()));
create policy listings_delete on public.listings for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

create policy favorites_read_own on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_insert_own on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy favorites_delete_own on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));
