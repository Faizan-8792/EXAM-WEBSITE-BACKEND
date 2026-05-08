create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) <= 500),
  question_type text not null default 'mcq' check (question_type in ('mcq', 'one_word')),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_answer integer not null check (correct_answer between 0 and 3),
  correct_text text not null default '' check (char_length(correct_text) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  singleton_key text primary key default 'default',
  passing_marks integer not null default 15 check (passing_marks >= 0),
  total_questions integer not null default 25 check (total_questions >= 1),
  exam_duration_minutes integer not null default 45 check (exam_duration_minutes >= 1),
  show_certificate_id boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) <= 40),
  expires_at timestamptz not null,
  active boolean not null default true,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  participant_identity text not null default '' check (char_length(participant_identity) <= 160),
  name text not null check (char_length(name) <= 120),
  branch text not null check (char_length(branch) <= 120),
  designation text not null default '' check (char_length(designation) <= 120),
  teaching_class text not null default '' check (char_length(teaching_class) <= 120),
  principal text not null default '' check (char_length(principal) <= 120),
  contact text not null check (char_length(contact) <= 20),
  client_fingerprint text not null,
  score integer not null default 0 check (score >= 0),
  total_questions integer not null default 0 check (total_questions >= 0),
  result text check (result in ('Pass', 'Fail')),
  date timestamptz not null default now(),
  exam_token text not null,
  exam_link_id uuid references public.exam_links(id),
  attempt_key text,
  exam_started_at timestamptz not null,
  exam_duration_seconds integer not null default 2700,
  assigned_question_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(assigned_question_ids) = 'array'),
  option_order jsonb not null default '{}'::jsonb check (jsonb_typeof(option_order) = 'object'),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  submitted boolean not null default false,
  submitted_at timestamptz,
  violation_count integer not null default 0 check (violation_count >= 0),
  terminated_due_to_violation boolean not null default false,
  termination_reason text check (char_length(termination_reason) <= 300),
  course_name text not null default 'AI & Robotics Examination',
  certificate_id text,
  certificate_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questions_created_at_idx on public.questions (created_at desc);
create index if not exists exam_links_code_idx on public.exam_links (code);
create index if not exists exam_links_expires_at_idx on public.exam_links (expires_at);
create index if not exists participants_date_idx on public.participants (date desc);
create index if not exists participants_result_date_idx on public.participants (result, date desc);
create index if not exists participants_exam_token_idx on public.participants (exam_token);
create index if not exists participants_client_fingerprint_idx on public.participants (client_fingerprint);
create index if not exists participants_exam_link_attempt_idx on public.participants (exam_link_id, attempt_key);
create index if not exists participants_exam_link_fingerprint_idx on public.participants (exam_link_id, client_fingerprint);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists exam_links_set_updated_at on public.exam_links;
create trigger exam_links_set_updated_at
before update on public.exam_links
for each row execute function public.set_updated_at();

drop trigger if exists participants_set_updated_at on public.participants;
create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

insert into public.settings (singleton_key, passing_marks, total_questions, exam_duration_minutes, show_certificate_id)
values ('default', 15, 25, 45, true)
on conflict (singleton_key) do nothing;

alter table public.questions enable row level security;
alter table public.settings enable row level security;
alter table public.exam_links enable row level security;
alter table public.participants enable row level security;
