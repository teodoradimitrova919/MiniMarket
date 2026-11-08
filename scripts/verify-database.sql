-- Historical INITIAL-schema test: empty disposable database, before admin migrations only.
-- Do not run against a populated/current project. Use verify-admin.mjs for current live RLS/API checks.
-- All historical fixtures and checks run in one transaction and are ALWAYS rolled back.
begin;

insert into auth.users (id, raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001', '{"username":"owner","role":"admin"}'),
 ('10000000-0000-4000-8000-000000000002', '{"username":"other"}'),
 ('10000000-0000-4000-8000-000000000003', '{}');

do $$ begin
  assert (select count(*) = 3 from public.profiles), 'Signup trigger creates profiles';
  assert (select bool_and(role = 'user') from public.profiles), 'Metadata cannot grant admin';
  assert (select username like 'user_%' from public.profiles where id = '10000000-0000-4000-8000-000000000003'), 'Username fallback';
end $$;
-- Only the trusted database administrator provisions this test admin.
update public.profiles set role = 'admin' where id = '10000000-0000-4000-8000-000000000003';
insert into public.categories (id, name) values ('20000000-0000-4000-8000-000000000001', 'Verification');
insert into public.listings (id, owner_id, category_id, title, price) values
 ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Verification', 0);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  assert (select count(*) = 1 from public.categories), 'Public categories';
  assert (select count(*) = 1 from public.listings), 'Public listings';
  begin perform * from public.profiles; raise exception 'Anonymous profiles allowed';
    exception when insufficient_privilege then null; end;
  begin perform * from public.favorites; raise exception 'Anonymous favorites allowed';
    exception when insufficient_privilege then null; end;
  begin insert into public.listings (owner_id, category_id, title, price) values
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Denied',1);
    raise exception 'Anonymous listing insert allowed'; exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ declare affected integer; begin
  assert (select count(*) = 1 from public.profiles), 'Own profile only';
  update public.profiles set username = 'updated' where id = auth.uid();
  assert (select username = 'updated' from public.profiles where id = auth.uid()), 'Username editable';
  begin update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'Role escalation allowed'; exception when insufficient_privilege then null; end;
  begin update public.profiles set id = '10000000-0000-4000-8000-000000000002' where id = auth.uid();
    raise exception 'Profile reassignment allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.profiles(id, username, role) values (auth.uid(),'bad','admin');
    raise exception 'Client profile insert allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.categories(name) values ('Denied');
    raise exception 'User category insert allowed'; exception when insufficient_privilege then null; end;
  update public.categories set name = 'Denied'; get diagnostics affected = row_count;
  assert affected = 0, 'User category update denied';
  delete from public.categories; get diagnostics affected = row_count;
  assert affected = 0, 'User category deletion denied';
  update public.listings set title = 'Owner updated', updated_at = '2000-01-01' where id = '30000000-0000-4000-8000-000000000001';
  assert (select title = 'Owner updated' and updated_at > '2000-01-01' from public.listings where id = '30000000-0000-4000-8000-000000000001'), 'Owner update and timestamp trigger';
  insert into public.listings(owner_id, category_id, title, price) values
    (auth.uid(),'20000000-0000-4000-8000-000000000001','Owner created',1);
  delete from public.listings where title = 'Owner created'; get diagnostics affected = row_count;
  assert affected = 1, 'Owner can create/delete';
  begin update public.listings set owner_id = '10000000-0000-4000-8000-000000000002';
    raise exception 'Listing reassignment allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.listings(owner_id,category_id,title,price) values
    ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Denied',1);
    raise exception 'Spoofed owner allowed'; exception when insufficient_privilege then null; end;
  insert into public.favorites(user_id,listing_id) values (auth.uid(),'30000000-0000-4000-8000-000000000001');
  begin insert into public.favorites(user_id,listing_id) values (auth.uid(),'30000000-0000-4000-8000-000000000001');
    raise exception 'Duplicate favorite allowed'; exception when unique_violation then null; end;
  assert (select count(*) = 1 from public.favorites), 'Own favorites readable';
  delete from public.favorites; get diagnostics affected = row_count;
  assert affected = 1, 'Own favorite removable';
  insert into public.favorites(user_id,listing_id) values (auth.uid(),'30000000-0000-4000-8000-000000000001');
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ declare affected integer; begin
  assert (select count(*) = 1 from public.profiles), 'Other profiles hidden';
  update public.profiles set username = 'Denied' where id = '10000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count; assert affected = 0, 'Other profile update denied';
  update public.listings set title = 'Denied'; get diagnostics affected = row_count;
  assert affected = 0, 'Other listing update denied';
  delete from public.listings; get diagnostics affected = row_count;
  assert affected = 0, 'Other listing delete denied';
  assert (select count(*) = 0 from public.favorites), 'Other favorites hidden';
  delete from public.favorites; get diagnostics affected = row_count;
  assert affected = 0, 'Other favorites deletion denied';
  begin insert into public.favorites(user_id,listing_id) values
    ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
    raise exception 'Spoofed favorite allowed'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$ declare affected integer; begin
  assert (select count(*) = 3 from public.profiles), 'Admin reads profiles';
  assert (select count(*) = 0 from public.favorites), 'Admin cannot read others favorites';
  insert into public.categories(name) values ('Admin created');
  update public.categories set name = 'Admin updated' where name = 'Admin created';
  get diagnostics affected = row_count; assert affected = 1, 'Admin category update';
  delete from public.categories where name = 'Admin updated';
  get diagnostics affected = row_count; assert affected = 1, 'Admin category delete';
  update public.listings set title = 'Admin updated';
  get diagnostics affected = row_count; assert affected = 1, 'Admin updates others listings';
  insert into public.listings(owner_id,category_id,title,price) values
    ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Admin created',1);
  delete from public.listings; get diagnostics affected = row_count;
  assert affected = 2, 'Admin deletes all listings';
end $$;

reset role;
do $$ begin
  assert (select count(*) = 0 from public.favorites), 'Listing deletion cascades favorites';
  begin insert into public.categories(name) values ('Verification');
    raise exception 'Duplicate category allowed'; exception when unique_violation then null; end;
  begin insert into public.categories(name) values ('   ');
    raise exception 'Blank category allowed'; exception when check_violation then null; end;
  begin update public.profiles set role = 'superadmin';
    raise exception 'Invalid role allowed'; exception when check_violation then null; end;
  begin update public.profiles set username = ' ';
    raise exception 'Blank username allowed'; exception when check_violation then null; end;
  begin insert into public.listings(owner_id,category_id,title,price) values
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',' ',0);
    raise exception 'Blank title allowed'; exception when check_violation then null; end;
  begin insert into public.listings(owner_id,category_id,title,price) values
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Invalid',-1);
    raise exception 'Negative price allowed'; exception when check_violation then null; end;
  begin insert into public.listings(owner_id,category_id,title,price) values
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Invalid','NaN');
    raise exception 'NaN price allowed'; exception when check_violation then null; end;
  begin insert into public.listings(owner_id,category_id,title,price) values
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099','Invalid',1);
    raise exception 'Missing category allowed'; exception when foreign_key_violation then null; end;
end $$;
insert into public.listings(owner_id,category_id,title,price) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Cascade check',1);
do $$ begin
  begin delete from public.categories;
    raise exception 'In-use category deletion allowed'; exception when foreign_key_violation then null; end;
end $$;
delete from auth.users where id = '10000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) = 0 from public.listings), 'User deletion cascades listings';
  assert not exists(select from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 'User deletion cascades profile';
end $$;
select 'PASS: signup, constraints, cascades, timestamps, visitor/owner/other/admin permissions' as verification;
rollback;
