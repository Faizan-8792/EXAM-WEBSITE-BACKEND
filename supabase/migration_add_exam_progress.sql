-- Migration: Add server-side exam progress persistence to participants
-- Run this against your Supabase project SQL editor.
--
-- These columns let an in-progress participant resume at the exact same
-- question with their saved answers after a page refresh, after leaving and
-- reopening the exam link, or even from a different device/browser where
-- localStorage is not available.

alter table public.participants
  add column if not exists progress_answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(progress_answers) = 'object');

alter table public.participants
  add column if not exists current_question_index integer not null default 0
    check (current_question_index >= 0);

comment on column public.participants.progress_answers is
  'In-progress (ungraded) answers keyed by question id. Used to resume an exam after refresh/reload across devices.';

comment on column public.participants.current_question_index is
  'Zero-based index of the question the participant was last viewing. Used to resume at the same question.';
