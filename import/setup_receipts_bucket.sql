-- One-time setup so receipts can be uploaded and viewed.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- It creates a PUBLIC storage bucket named "receipts" and the policy that lets
-- the app upload files into it. Receipt links are saved on each transaction in
-- the existing `invoice_url` column and shown as the "Receipt" column in the app.

-- 1. Create (or make public) the receipts bucket
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

-- 2. Allow the app to upload receipts into this bucket
create policy "Anyone can upload receipts"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'receipts');

-- 3. Allow reading receipts (public bucket already serves files publicly,
--    this also covers listing/metadata if ever needed)
create policy "Anyone can read receipts"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'receipts');
