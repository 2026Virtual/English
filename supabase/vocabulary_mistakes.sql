create extension if not exists pgcrypto;

create table if not exists public.vocabulary_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_key text not null,
  note_type text not null check (note_type in ('A', 'B')),
  word text not null,
  pos text not null default '',
  meaning text not null default '',
  sentence text not null default '',
  mnemonic text not null default '',
  chapter_name text not null default '',
  sort_order integer not null default 0,
  source_file text not null default '',
  source_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_mistakes_user_source_word_key_key unique (user_id, source_label, word_key)
);

update public.vocabulary_mistakes
set source_label = '云端词汇整理历史'
where coalesce(source_label, '') = '';

alter table public.vocabulary_mistakes
add column if not exists sort_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, source_label
      order by created_at, id
    )::integer as next_sort_order
  from public.vocabulary_mistakes
  where sort_order = 0
)
update public.vocabulary_mistakes as target
set sort_order = ranked.next_sort_order
from ranked
where target.id = ranked.id;

alter table public.vocabulary_mistakes
drop constraint if exists vocabulary_mistakes_user_id_word_key_key;

alter table public.vocabulary_mistakes
drop constraint if exists vocabulary_mistakes_user_source_word_key_key;

alter table public.vocabulary_mistakes
add constraint vocabulary_mistakes_user_source_word_key_key
unique (user_id, source_label, word_key);

create or replace function public.set_vocabulary_mistakes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vocabulary_mistakes_updated_at on public.vocabulary_mistakes;

create trigger set_vocabulary_mistakes_updated_at
before update on public.vocabulary_mistakes
for each row
execute function public.set_vocabulary_mistakes_updated_at();

alter table public.vocabulary_mistakes enable row level security;

drop policy if exists "vocabulary mistakes select own rows" on public.vocabulary_mistakes;
drop policy if exists "vocabulary mistakes insert own rows" on public.vocabulary_mistakes;
drop policy if exists "vocabulary mistakes update own rows" on public.vocabulary_mistakes;
drop policy if exists "vocabulary mistakes delete own rows" on public.vocabulary_mistakes;

create policy "vocabulary mistakes select own rows"
on public.vocabulary_mistakes
for select
to authenticated
using (auth.uid() = user_id);

create policy "vocabulary mistakes insert own rows"
on public.vocabulary_mistakes
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "vocabulary mistakes update own rows"
on public.vocabulary_mistakes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "vocabulary mistakes delete own rows"
on public.vocabulary_mistakes
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists vocabulary_mistakes_user_updated_idx
on public.vocabulary_mistakes (user_id, updated_at desc);

create index if not exists vocabulary_mistakes_user_source_order_idx
on public.vocabulary_mistakes (user_id, source_label, sort_order);

-- Optional stricter single-account lock:
-- If you want this table to accept only one email address, replace YOUR_EMAIL@example.com
-- and add this condition to each policy above:
--   and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_EMAIL@example.com')
