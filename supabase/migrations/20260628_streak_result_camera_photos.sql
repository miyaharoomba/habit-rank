-- Camera-only photo captured immediately before a streak session is finished.
alter table public.streak_sessions
  add column if not exists result_photo_path text,
  add column if not exists result_photo_captured_at timestamptz;

comment on column public.streak_sessions.result_photo_path is
  'Private Storage path for the camera photo captured at session completion.';

comment on column public.streak_sessions.result_photo_captured_at is
  'Server-validated capture time for the session result photo.';
