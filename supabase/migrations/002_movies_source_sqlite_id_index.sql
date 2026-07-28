-- Speeds up GET /api/v1/movies/:id (lookup by source_sqlite_id).
-- Run in Supabase SQL Editor if not already applied.
create index concurrently if not exists movies_source_sqlite_id_idx
  on public.movies (source_sqlite_id);
