-- Avatar storage bucket.
--
-- PROBLEM
-- Profile photos never left the device. pickAndSetProfilePhoto() copied the
-- resized JPEG into the app's local documents dir and wrote only the bare
-- filename ('profile_avatar.jpg') to profiles.avatar_url. The image BYTES were
-- never uploaded anywhere, so a photo could not survive a reinstall, could not
-- sync across devices, and could not be shown to anyone else. On a second device
-- the filename resolved to a path with no file and rendered blank — the reported
-- "I added a photo and it didn't save."
--
-- FIX
-- A public Storage bucket. The client uploads the bytes to avatars/{userId}/avatar.jpg
-- and stores the resulting public URL in profiles.avatar_url. resolveAvatarUri()
-- passes http(s) URLs through untouched, so the photo now resolves on any device.
--
-- Public read is intentional and safe: avatars are shown in the SOTD feed and on
-- the profile, they carry no private data, and a public bucket avoids signed-URL
-- expiry. Writes are locked to the owner's own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true,
  5242880,                                             -- 5 MB ceiling (we upload ~30KB)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention is {userId}/avatar.jpg, so (storage.foldername(name))[1] is the
-- owner's uid. Read is open; write/update/delete are restricted to your own folder.
drop policy if exists "avatars_public_read"   on storage.objects;
drop policy if exists "avatars_owner_insert"  on storage.objects;
drop policy if exists "avatars_owner_update"  on storage.objects;
drop policy if exists "avatars_owner_delete"  on storage.objects;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
