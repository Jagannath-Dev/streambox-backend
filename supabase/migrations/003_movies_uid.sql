-- movies.uid already exists in production; keep this for greenfield / docs.
-- Search returns uid as `id`; detail: GET /api/v1/movies/{uid}

create extension if not exists "pgcrypto";

alter table public.movies
  add column if not exists uid uuid default gen_random_uuid();

update public.movies
set uid = gen_random_uuid()
where uid is null;

create unique index if not exists movies_uid_uidx on public.movies (uid);
