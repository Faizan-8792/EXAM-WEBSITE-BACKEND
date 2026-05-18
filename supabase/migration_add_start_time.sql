-- Migration: Add start_time column to exam_links
-- Run this against your Supabase project SQL editor

alter table public.exam_links
  add column if not exists start_time timestamptz;

-- Index for efficient scheduling queries
create index if not exists exam_links_start_time_idx on public.exam_links (start_time);

-- Update the schema comment
comment on column public.exam_links.start_time is
  'Optional exam start time. If set, the link is not accessible before this time and students see a countdown.';

comment on column public.exam_links.expires_at is
  'Exam end time. The link expires after this timestamp.';
