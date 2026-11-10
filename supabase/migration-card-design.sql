-- Run this ONCE in Supabase > SQL Editor (safe to run again).
-- Adds the "sensitive topic" marker (red !! badge) to questions.
alter table questions add column if not exists sensitive boolean not null default false;
