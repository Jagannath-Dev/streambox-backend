import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Movie,
  MovieListQuery,
  MovieListResult,
  MovieSearchScope,
  MovieSort,
  MovieTorrent,
} from '../../domain/entities/movie.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  escapeIlike,
  MOVIE_LANGUAGES,
  resolveMovieLanguage,
} from '../../shared/movies/filters.js';
import { normalizeMovierulzUrl } from '../../shared/movies/poster-url.js';

type MovieRow = {
  uid: string;
  detail_url: string;
  source_sqlite_id: number | null;
  list_title: string | null;
  list_poster_url: string | null;
  page_title: string | null;
  movie_name: string | null;
  year: number | null;
  movie_quality: string | null;
  image_url: string | null;
  directed_by_json: string | null;
  written_by_json: string | null;
  starring_json: string | null;
  genres_json: string | null;
  categories_json: string | null;
  tags_json: string | null;
  country: string | null;
  language: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  fetched_at: string | null;
  synced_at: string | null;
};

const SELECT =
  'uid, detail_url, source_sqlite_id, list_title, list_poster_url, page_title, movie_name, year, movie_quality, image_url, directed_by_json, written_by_json, starring_json, genres_json, categories_json, tags_json, country, language, description, created_at, updated_at, fetched_at, synced_at';

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toMovie(row: MovieRow, posterMirror: string): Movie {
  return {
    id: row.uid,
    detailUrl: row.detail_url,
    sourceSqliteId: row.source_sqlite_id,
    listTitle: row.list_title,
    listPosterUrl: normalizeMovierulzUrl(row.list_poster_url, posterMirror),
    pageTitle: row.page_title,
    movieName: row.movie_name,
    year: row.year,
    movieQuality: row.movie_quality,
    imageUrl: normalizeMovierulzUrl(row.image_url, posterMirror),
    directedBy: parseJsonArray(row.directed_by_json),
    writtenBy: parseJsonArray(row.written_by_json),
    starring: parseJsonArray(row.starring_json),
    genres: parseJsonArray(row.genres_json),
    categories: parseJsonArray(row.categories_json),
    tags: parseJsonArray(row.tags_json),
    country: row.country,
    language: resolveMovieLanguage(row.language, row.list_title, row.page_title),
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fetchedAt: row.fetched_at,
    syncedAt: row.synced_at,
  };
}

/** "400 MB" / "1.4 GB" → bytes for size-asc sort. Unknown → last. */
function sizeLabelToBytes(label: string | null): number {
  if (!label) return Number.POSITIVE_INFINITY;
  const m = label.trim().match(/^([\d.]+)\s*(KB|MB|GB|TB)\b/i);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
  const unit = m[2].toUpperCase();
  const mult =
    unit === 'KB' ? 1e3 : unit === 'MB' ? 1e6 : unit === 'GB' ? 1e9 : unit === 'TB' ? 1e12 : 1;
  return n * mult;
}

function scopeOrFilter(term: string, scope: MovieSearchScope): string {
  const t = escapeIlike(term);
  const title = `movie_name.ilike.%${t}%,list_title.ilike.%${t}%,page_title.ilike.%${t}%`;
  const actor = `starring_json.ilike.%${t}%`;
  const director = `directed_by_json.ilike.%${t}%`;
  const writer = `written_by_json.ilike.%${t}%`;
  const keyword = `tags_json.ilike.%${t}%,categories_json.ilike.%${t}%,genres_json.ilike.%${t}%`;

  switch (scope) {
    case 'title':
      return title;
    case 'actor':
    case 'cast':
      return actor;
    case 'director':
      return director;
    case 'writer':
      return writer;
    case 'keyword':
      return keyword;
    case 'all':
    default:
      return `${title},${actor},${director},${writer},${keyword}`;
  }
}

export class SupabaseMovieRepository {
  constructor(
    private readonly db: SupabaseClient,
    private readonly posterMirror: string,
  ) {}

  async search(query: MovieListQuery): Promise<MovieListResult> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const sort: MovieSort = query.sort ?? 'newest';

    let q = this.db.from('movies').select(SELECT, { count: 'exact' });

    switch (sort) {
      case 'oldest':
        q = q.order('updated_at', { ascending: true, nullsFirst: false });
        break;
      case 'year_desc':
        q = q.order('year', { ascending: false, nullsFirst: false });
        break;
      case 'year_asc':
        q = q.order('year', { ascending: true, nullsFirst: false });
        break;
      case 'az':
        q = q.order('movie_name', { ascending: true, nullsFirst: false });
        break;
      case 'za':
        q = q.order('movie_name', { ascending: false, nullsFirst: false });
        break;
      case 'newest':
      default:
        q = q.order('updated_at', { ascending: false, nullsFirst: false });
        break;
    }

    q = q.range(from, to);

    if (query.q?.trim()) {
      q = q.or(scopeOrFilter(query.q, query.scope ?? 'title'));
    }

    if (query.language?.trim()) {
      const lang = query.language.trim();
      if (lang.toLowerCase() === 'other') {
        q = q.not('language', 'in', `(${MOVIE_LANGUAGES.map((l) => `"${l}"`).join(',')})`);
      } else if (lang.toLowerCase() !== 'all') {
        // DB language is often null — also match [Lang] in list/page title
        const t = escapeIlike(lang);
        q = q.or(
          `language.ilike.%${t}%,list_title.ilike.%[${t}]%,list_title.ilike.%${t}%,page_title.ilike.%${t}%`,
        );
      }
    }

    if (query.year != null) q = q.eq('year', query.year);
    if (query.quality?.trim() && query.quality.toLowerCase() !== 'all') {
      q = q.ilike('movie_quality', `%${escapeIlike(query.quality)}%`);
    }
    if (query.country?.trim() && query.country.toLowerCase() !== 'all') {
      q = q.ilike('country', escapeIlike(query.country));
    }
    if (query.genre?.trim() && query.genre.toLowerCase() !== 'all') {
      q = q.ilike('genres_json', `%${escapeIlike(query.genre)}%`);
    }
    if (query.category?.trim()) {
      q = q.ilike('categories_json', `%${escapeIlike(query.category)}%`);
    }

    const { data, error, count } = await q;
    if (error) throw AppError.upstream('Failed to search movies', error);

    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      items: ((data ?? []) as MovieRow[]).map((row) => toMovie(row, this.posterMirror)),
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1 && totalPages > 0,
    };
  }

  async findByUid(uid: string): Promise<Movie | null> {
    const { data, error } = await this.db
      .from('movies')
      .select(SELECT)
      .eq('uid', uid)
      .maybeSingle();
    if (error) throw AppError.upstream('Failed to fetch movie', error);
    return data ? toMovie(data as MovieRow, this.posterMirror) : null;
  }

  async findByDetailUrl(detailUrl: string): Promise<Movie | null> {
    const { data, error } = await this.db
      .from('movies')
      .select(SELECT)
      .eq('detail_url', detailUrl)
      .maybeSingle();
    if (error) throw AppError.upstream('Failed to fetch movie', error);
    return data ? toMovie(data as MovieRow, this.posterMirror) : null;
  }

  async listTorrentsByDetailUrl(detailUrl: string): Promise<MovieTorrent[]> {
    const { data, error } = await this.db
      .from('torrents')
      .select('id, detail_url, quality, size_label, magnet_uri, sort_order')
      .eq('detail_url', detailUrl);
    if (error) throw AppError.upstream('Failed to fetch torrents', error);
    return (data ?? [])
      .map((row) => ({
        id: row.id as number,
        detailUrl: row.detail_url as string,
        quality: (row.quality as string) || null,
        sizeLabel: (row.size_label as string) || null,
        magnetUri: row.magnet_uri as string,
        sortOrder: (row.sort_order as number) ?? 0,
      }))
      .sort((a, b) => sizeLabelToBytes(a.sizeLabel) - sizeLabelToBytes(b.sizeLabel))
      .map((t, i) => ({ ...t, sortOrder: i }));
  }
}
