import type { Env } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/app-error.js';

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type TmdbAutocompleteItem = {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
};

export type TmdbSearchItem = TmdbAutocompleteItem & {
  overview: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  originalLanguage: string | null;
  popularity: number | null;
  genreIds: number[];
};

export type TmdbSearchResult = {
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
  type: 'movie' | 'tv' | 'all';
  results: TmdbSearchItem[];
};

type TmdbRaw = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string | null;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  original_language?: string | null;
  popularity?: number | null;
  genre_ids?: number[];
};

type TmdbPage = {
  page?: number;
  total_pages?: number;
  total_results?: number;
  results?: TmdbRaw[];
};

/** India + China + English (UI language picker). */
const LANGUAGES = [
  { id: 'hi', label: 'Hindi' },
  { id: 'te', label: 'Telugu' },
  { id: 'ta', label: 'Tamil' },
  { id: 'ml', label: 'Malayalam' },
  { id: 'kn', label: 'Kannada' },
  { id: 'zh', label: 'Chinese' },
  { id: 'en', label: 'English' },
] as const;

/** India langs + USA/English + China + Korea + Japan (content original language). */
const ORIGINAL_LANGUAGES = [
  { id: 'hi', label: 'Hindi' },
  { id: 'te', label: 'Telugu' },
  { id: 'ta', label: 'Tamil' },
  { id: 'ml', label: 'Malayalam' },
  { id: 'kn', label: 'Kannada' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ko', label: 'Korean' },
  { id: 'ja', label: 'Japanese' },
] as const;

const REGIONS = [
  { id: 'IN', label: 'India' },
  { id: 'US', label: 'United States' },
  { id: 'CN', label: 'China' },
  { id: 'KR', label: 'South Korea' },
  { id: 'JP', label: 'Japan' },
] as const;

const RATING_OPTIONS = [
  { id: 'any', label: 'Any', min: null as number | null },
  { id: '6', label: '6+', min: 6 },
  { id: '7', label: '7+', min: 7 },
  { id: '8', label: '8+', min: 8 },
] as const;

const SORT_OPTIONS = [
  { id: 'popular', label: 'Popular', movie: 'popularity.desc', tv: 'popularity.desc' },
  { id: 'newest', label: 'Newest', movie: 'primary_release_date.desc', tv: 'first_air_date.desc' },
  { id: 'oldest', label: 'Oldest', movie: 'primary_release_date.asc', tv: 'first_air_date.asc' },
  { id: 'top_rated', label: 'Top rated', movie: 'vote_average.desc', tv: 'vote_average.desc' },
] as const;

const SEARCH_SCOPES = [
  { id: 'title', label: 'Title' },
  { id: 'actor', label: 'Actor' },
  { id: 'director', label: 'Director' },
  { id: 'writer', label: 'Writer' },
  { id: 'keyword', label: 'Keyword' },
] as const;

export type TmdbSearchScope = (typeof SEARCH_SCOPES)[number]['id'];

const WRITER_JOBS = new Set([
  'writer',
  'screenplay',
  'story',
  'novel',
  'characters',
  'teleplay',
  'author',
  'comic book',
]);

export const TMDB_SEARCH_FILTERS = {
  types: [
    { id: 'all', label: 'All' },
    { id: 'movie', label: 'Movies' },
    { id: 'tv', label: 'TV' },
  ] as const,
  scopes: SEARCH_SCOPES,
  originalLanguages: ORIGINAL_LANGUAGES,
  regions: REGIONS,
  ratings: RATING_OPTIONS,
  sorts: SORT_OPTIONS,
  limit: 10,
};

export type TmdbFilterCatalog = {
  types: Array<{ id: string; label: string }>;
  scopes: Array<{ id: string; label: string }>;
  years: number[];
  regions: Array<{ id: string; label: string }>;
  originalLanguages: Array<{ id: string; label: string }>;
  ratings: Array<{ id: string; label: string; min: number | null }>;
  sorts: Array<{ id: string; label: string }>;
  movieGenres: Array<{ id: number; name: string }>;
  tvGenres: Array<{ id: number; name: string }>;
  languages: Array<{ id: string; label: string }>;
  countries: Array<{ id: string; label: string }>;
  limit: number;
};

const RETRYABLE = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ABORT_ERR',
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function errorDetails(err: unknown) {
  if (!(err instanceof Error)) return { message: String(err) };
  const nested = err.cause as NodeJS.ErrnoException | undefined;
  return {
    message: err.message,
    code: nested?.code ?? (err as NodeJS.ErrnoException).code,
    hostname: (nested as { hostname?: string } | undefined)?.hostname,
  };
}

function isRetryable(err: unknown, status?: number): boolean {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const d = errorDetails(err);
  if (d.code && RETRYABLE.has(d.code)) return true;
  return err instanceof Error && /fetch failed|network|timeout/i.test(err.message);
}

function yearFrom(date?: string): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function posterUrl(path?: string | null, size = 'w185'): string | null {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path.startsWith('/') ? path : `/${path}`}`;
}

function mapItem(raw: TmdbRaw, fallback: 'movie' | 'tv'): TmdbSearchItem | null {
  const mediaType =
    raw.media_type === 'tv' || raw.media_type === 'movie'
      ? raw.media_type
      : fallback;
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;
  const title = (raw.title || raw.name || '').trim();
  if (!title) return null;
  return {
    id: raw.id,
    mediaType,
    title,
    year: yearFrom(raw.release_date || raw.first_air_date),
    posterUrl: posterUrl(raw.poster_path),
    overview: raw.overview ?? null,
    backdropUrl: posterUrl(raw.backdrop_path, 'w780'),
    voteAverage: raw.vote_average ?? null,
    originalLanguage: raw.original_language ?? null,
    popularity: raw.popularity ?? null,
    genreIds: Array.isArray(raw.genre_ids) ? raw.genre_ids.map(Number) : [],
  };
}

function movieYears(from = 2026, to = 2000): number[] {
  const years: number[] = [];
  for (let y = from; y >= to; y -= 1) years.push(y);
  return years;
}

function toAutocomplete(item: TmdbSearchItem): TmdbAutocompleteItem {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    posterUrl: item.posterUrl,
  };
}

/** Parse "Salaar 2023" → { title: "Salaar", year: 2023 }. */
export function parseTitleYear(input: string): { title: string; year?: number } {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  const m = trimmed.match(/^(.*?)\s+((?:19|20)\d{2})$/);
  if (m && m[1].trim()) return { title: m[1].trim(), year: Number(m[2]) };
  return { title: trimmed };
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/gi, ' ')
    .trim();
}

/** Best match by exact title + year, then contains, then popularity. */
export function pickBestMatch(
  items: TmdbSearchItem[],
  title: string,
  year?: number,
): TmdbSearchItem | null {
  if (items.length === 0) return null;
  const want = normalizeTitle(title);
  let pool = items;
  if (year != null) {
    const byYear = pool.filter((r) => r.year === year);
    if (byYear.length) pool = byYear;
  }
  const exact = pool.filter((r) => normalizeTitle(r.title) === want);
  const candidates = exact.length ? exact : pool.filter((r) => normalizeTitle(r.title).includes(want));
  const ranked = (candidates.length ? candidates : pool).slice().sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
  );
  return ranked[0] ?? null;
}

/**
 * Minimal TMDB client for autocomplete (search/movie | search/tv | search/multi).
 */
export class TmdbService {
  constructor(private readonly env: Env) {}

  private async request<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${this.env.TMDB_BASE_URL}${path}`);
    url.searchParams.set('api_key', this.env.TMDB_API_KEY);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const attempts = 3;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (attempt < attempts && isRetryable(undefined, res.status)) {
            await sleep(200 * attempt);
            continue;
          }
          if (res.status === 404) {
            throw AppError.notFound('TMDB resource not found', {
              status: res.status,
              body: body.slice(0, 300),
            });
          }
          throw AppError.upstream('TMDB returned an error', {
            status: res.status,
            body: body.slice(0, 300),
          });
        }
        return (await res.json()) as T;
      } catch (cause) {
        if (cause instanceof AppError) throw cause;
        lastErr = cause;
        if (attempt < attempts && isRetryable(cause)) {
          await sleep(200 * attempt);
          continue;
        }
        throw AppError.upstream('TMDB request failed', errorDetails(cause));
      }
    }

    throw AppError.upstream('TMDB request failed', errorDetails(lastErr));
  }

  /** Filter catalog — curated regions/languages + live TMDB genres. */
  async getFilters(): Promise<TmdbFilterCatalog> {
    const [movieGenres, tvGenres] = await Promise.all([
      this.request<{ genres: Array<{ id: number; name: string }> }>('/genre/movie/list', {}),
      this.request<{ genres: Array<{ id: number; name: string }> }>('/genre/tv/list', {}),
    ]);

    const regions = REGIONS.map((r) => ({ id: r.id, label: r.label }));
    const originalLanguages = ORIGINAL_LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
    const languages = LANGUAGES.map((l) => ({ id: l.id, label: l.label }));

    return {
      types: TMDB_SEARCH_FILTERS.types.map((t) => ({ id: t.id, label: t.label })),
      scopes: SEARCH_SCOPES.map((s) => ({ id: s.id, label: s.label })),
      years: movieYears(),
      regions,
      originalLanguages,
      ratings: RATING_OPTIONS.map((r) => ({ id: r.id, label: r.label, min: r.min })),
      sorts: SORT_OPTIONS.map((s) => ({ id: s.id, label: s.label })),
      movieGenres: movieGenres.genres ?? [],
      tvGenres: tvGenres.genres ?? [],
      languages,
      countries: regions,
      limit: TMDB_SEARCH_FILTERS.limit,
    };
  }

  private async fetchSearchPage(
    type: 'movie' | 'tv' | 'all',
    q: string,
    tmdbPage: number,
    filters: { year?: number; region?: string },
  ): Promise<{ items: TmdbSearchItem[]; totalResults: number }> {
    const base: Record<string, string> = {
      query: q,
      include_adult: 'false',
      page: String(tmdbPage),
    };
    if (filters.region) base.region = filters.region;

    if (type === 'movie') {
      if (filters.year != null) base.primary_release_year = String(filters.year);
      const data = await this.request<TmdbPage>('/search/movie', base);
      return {
        items: (data.results ?? [])
          .map((r) => mapItem(r, 'movie'))
          .filter((x): x is TmdbSearchItem => x != null),
        totalResults: data.total_results ?? 0,
      };
    }

    if (type === 'tv') {
      if (filters.year != null) base.first_air_date_year = String(filters.year);
      const data = await this.request<TmdbPage>('/search/tv', base);
      return {
        items: (data.results ?? [])
          .map((r) => mapItem(r, 'tv'))
          .filter((x): x is TmdbSearchItem => x != null),
        totalResults: data.total_results ?? 0,
      };
    }

    const data = await this.request<TmdbPage>('/search/multi', base);
    let items = (data.results ?? [])
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => mapItem(r, r.media_type === 'tv' ? 'tv' : 'movie'))
      .filter((x): x is TmdbSearchItem => x != null);
    if (filters.year != null) {
      items = items.filter((r) => r.year === filters.year);
    }
    return { items, totalResults: data.total_results ?? 0 };
  }

  private applyResultFilters(
    items: TmdbSearchItem[],
    opts: {
      year?: number;
      originalLanguage?: string;
      genreId?: number;
      rating?: string;
    },
  ): TmdbSearchItem[] {
    const ratingMin = RATING_OPTIONS.find((r) => r.id === opts.rating)?.min ?? null;
    let filtered = items;
    if (opts.year != null) filtered = filtered.filter((r) => r.year === opts.year);
    if (opts.originalLanguage) {
      const lang = opts.originalLanguage.toLowerCase();
      filtered = filtered.filter((r) => (r.originalLanguage ?? '').toLowerCase() === lang);
    }
    if (opts.genreId != null) {
      filtered = filtered.filter((r) => r.genreIds.includes(opts.genreId!));
    }
    if (ratingMin != null) {
      filtered = filtered.filter((r) => (r.voteAverage ?? 0) >= ratingMin);
    }
    return filtered;
  }

  private dedupeItems(items: TmdbSearchItem[]): TmdbSearchItem[] {
    const seen = new Set<string>();
    const out: TmdbSearchItem[] = [];
    for (const item of items) {
      const key = `${item.mediaType}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  private pageSlice(items: TmdbSearchItem[], page: number, type: 'movie' | 'tv' | 'all'): TmdbSearchResult {
    const limit = TMDB_SEARCH_FILTERS.limit;
    const totalResults = items.length;
    const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit);
    const offset = (Math.max(1, page) - 1) * limit;
    return {
      page: Math.max(1, page),
      limit,
      totalPages,
      totalResults,
      type,
      results: items.slice(offset, offset + limit),
    };
  }

  /**
   * Actor / director / writer: resolve top person, then their credits.
   * ponytail: in-memory page over top person's credits (upgrade: multi-person / discover).
   */
  private async searchByPerson(
    q: string,
    role: 'actor' | 'director' | 'writer',
    type: 'movie' | 'tv' | 'all',
    page: number,
    filters: {
      year?: number;
      region?: string;
      originalLanguage?: string;
      genreId?: number;
      rating?: string;
    },
  ): Promise<TmdbSearchResult> {
    const people = await this.request<TmdbPage>('/search/person', {
      query: q,
      include_adult: 'false',
      page: '1',
    });
    const personId = people.results?.[0]?.id;
    if (personId == null) {
      return this.pageSlice([], page, type);
    }

    type CreditPage = {
      cast?: TmdbRaw[];
      crew?: Array<TmdbRaw & { job?: string; department?: string }>;
    };

    const [movieCredits, tvCredits] = await Promise.all([
      type === 'tv'
        ? Promise.resolve({ cast: [], crew: [] } as CreditPage)
        : this.request<CreditPage>(`/person/${personId}/movie_credits`, {}),
      type === 'movie'
        ? Promise.resolve({ cast: [], crew: [] } as CreditPage)
        : this.request<CreditPage>(`/person/${personId}/tv_credits`, {}),
    ]);

    let raw: TmdbSearchItem[] = [];
    if (role === 'actor') {
      raw = [
        ...(movieCredits.cast ?? []).map((r) => mapItem(r, 'movie')),
        ...(tvCredits.cast ?? []).map((r) => mapItem(r, 'tv')),
      ].filter((x): x is TmdbSearchItem => x != null);
    } else if (role === 'director') {
      raw = [
        ...(movieCredits.crew ?? [])
          .filter((c) => (c.job ?? '').toLowerCase() === 'director')
          .map((r) => mapItem(r, 'movie')),
        ...(tvCredits.crew ?? [])
          .filter((c) => (c.job ?? '').toLowerCase() === 'director')
          .map((r) => mapItem(r, 'tv')),
      ].filter((x): x is TmdbSearchItem => x != null);
    } else {
      const isWriter = (c: { job?: string; department?: string }) => {
        const job = (c.job ?? '').toLowerCase();
        const dept = (c.department ?? '').toLowerCase();
        return WRITER_JOBS.has(job) || dept === 'writing';
      };
      raw = [
        ...(movieCredits.crew ?? []).filter(isWriter).map((r) => mapItem(r, 'movie')),
        ...(tvCredits.crew ?? []).filter(isWriter).map((r) => mapItem(r, 'tv')),
      ].filter((x): x is TmdbSearchItem => x != null);
    }

    const items = this.applyResultFilters(this.dedupeItems(raw), filters).sort(
      (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
    );
    return this.pageSlice(items, page, type);
  }

  /** Keyword → discover with_keywords. */
  private async searchByKeyword(
    q: string,
    type: 'movie' | 'tv' | 'all',
    page: number,
    filters: {
      year?: number;
      region?: string;
      originalLanguage?: string;
      genreId?: number;
      rating?: string;
    },
  ): Promise<TmdbSearchResult> {
    const kwPage = await this.request<{ results?: Array<{ id: number; name: string }> }>(
      '/search/keyword',
      { query: q, page: '1' },
    );
    const keywordId = kwPage.results?.[0]?.id;
    if (keywordId == null) return this.pageSlice([], page, type);

    const ratingMin = RATING_OPTIONS.find((r) => r.id === filters.rating)?.min ?? null;
    const buildDiscover = (media: 'movie' | 'tv'): Record<string, string> => {
      const query: Record<string, string> = {
        include_adult: 'false',
        page: String(Math.max(1, page)),
        sort_by: 'popularity.desc',
        with_keywords: String(keywordId),
      };
      if (filters.originalLanguage) {
        query.with_original_language = filters.originalLanguage.toLowerCase();
      }
      if (filters.genreId != null) query.with_genres = String(filters.genreId);
      if (ratingMin != null) {
        query['vote_average.gte'] = String(ratingMin);
        query['vote_count.gte'] = '50';
      }
      if (filters.region) query.region = filters.region.toUpperCase();
      if (filters.year != null) {
        if (media === 'movie') query.primary_release_year = String(filters.year);
        else query.first_air_date_year = String(filters.year);
      }
      return query;
    };

    if (type === 'movie' || type === 'tv') {
      const data = await this.request<TmdbPage>(`/discover/${type}`, buildDiscover(type));
      const results = (data.results ?? [])
        .map((r) => mapItem(r, type))
        .filter((x): x is TmdbSearchItem => x != null)
        .slice(0, TMDB_SEARCH_FILTERS.limit);
      return {
        page: data.page ?? page,
        limit: TMDB_SEARCH_FILTERS.limit,
        totalPages: data.total_pages ?? 0,
        totalResults: data.total_results ?? 0,
        type,
        results,
      };
    }

    const [movies, tv] = await Promise.all([
      this.request<TmdbPage>('/discover/movie', buildDiscover('movie')),
      this.request<TmdbPage>('/discover/tv', buildDiscover('tv')),
    ]);
    const results = this.dedupeItems([
      ...(movies.results ?? []).map((r) => mapItem(r, 'movie')),
      ...(tv.results ?? []).map((r) => mapItem(r, 'tv')),
    ].filter((x): x is TmdbSearchItem => x != null))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, TMDB_SEARCH_FILTERS.limit);

    return {
      page,
      limit: TMDB_SEARCH_FILTERS.limit,
      totalPages: Math.max(movies.total_pages ?? 0, tv.total_pages ?? 0),
      totalResults: (movies.total_results ?? 0) + (tv.total_results ?? 0),
      type: 'all',
      results,
    };
  }

  /**
   * Unified search: movie | tv | all, with filters from /tmdb/filters.
   * scope: title | actor | director | writer | keyword
   * Page size fixed at 10 (TMDB returns 20/page → split in half for title).
   */
  async search(opts: {
    q: string;
    type?: 'movie' | 'tv' | 'all';
    scope?: TmdbSearchScope;
    page?: number;
    year?: number;
    region?: string;
    originalLanguage?: string;
    genreId?: number;
    rating?: string;
  }): Promise<TmdbSearchResult> {
    const type = opts.type ?? 'all';
    const scope = opts.scope ?? 'title';
    const page = Math.max(1, opts.page ?? 1);
    const q = opts.q.trim();
    const filters = {
      year: opts.year,
      region: opts.region,
      originalLanguage: opts.originalLanguage,
      genreId: opts.genreId,
      rating: opts.rating,
    };

    if (scope === 'actor' || scope === 'director' || scope === 'writer') {
      return this.searchByPerson(q, scope, type, page, filters);
    }
    if (scope === 'keyword') {
      return this.searchByKeyword(q, type, page, filters);
    }

    const limit = 10;
    const tmdbPage = Math.ceil(page / 2);
    const offset = ((page - 1) % 2) * limit;

    const { items, totalResults } = await this.fetchSearchPage(type, q, tmdbPage, {
      year: opts.year,
      region: opts.region,
    });

    const filtered = this.applyResultFilters(items, filters);
    const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit);

    return {
      page,
      limit,
      totalPages,
      totalResults,
      type,
      results: filtered.slice(offset, offset + limit),
    };
  }

  /** Slim suggestions for typeahead — max 10. */
  async autocomplete(opts: {
    q: string;
    type?: 'movie' | 'tv' | 'all';
    limit?: number;
  }): Promise<TmdbAutocompleteItem[]> {
    const type = opts.type ?? 'all';
    const limit = Math.min(10, Math.max(1, opts.limit ?? 10));
    const result = await this.search({ q: opts.q, type, page: 1 });
    return result.results.slice(0, limit).map(toAutocomplete);
  }

  private async discoverOne(
    type: 'movie' | 'tv',
    opts: {
      page: number;
      year?: number;
      region?: string;
      originalLanguage?: string;
      genreId?: number;
      rating?: string;
      sort?: string;
    },
  ): Promise<TmdbSearchResult> {
    const page = Math.max(1, opts.page);
    const sort =
      SORT_OPTIONS.find((s) => s.id === opts.sort) ?? SORT_OPTIONS[0];
    const ratingMin = RATING_OPTIONS.find((r) => r.id === opts.rating)?.min ?? null;

    const query: Record<string, string> = {
      include_adult: 'false',
      page: String(page),
      sort_by: type === 'movie' ? sort.movie : sort.tv,
    };
    if (opts.originalLanguage) query.with_original_language = opts.originalLanguage.toLowerCase();
    if (opts.genreId != null) query.with_genres = String(opts.genreId);
    if (ratingMin != null) {
      query['vote_average.gte'] = String(ratingMin);
      query['vote_count.gte'] = '50';
    }
    if (opts.region) query.region = opts.region.toUpperCase();
    if (opts.year != null) {
      if (type === 'movie') query.primary_release_year = String(opts.year);
      else query.first_air_date_year = String(opts.year);
    }

    const data = await this.request<TmdbPage>(`/discover/${type}`, query);
    const results = (data.results ?? [])
      .map((r) => mapItem(r, type))
      .filter((x): x is TmdbSearchItem => x != null)
      .slice(0, TMDB_SEARCH_FILTERS.limit);

    return {
      page: data.page ?? page,
      limit: TMDB_SEARCH_FILTERS.limit,
      totalPages: data.total_pages ?? 0,
      totalResults: data.total_results ?? 0,
      type,
      results,
    };
  }

  /**
   * Unified discover: movie | tv | all, same filters as /tmdb/filters.
   */
  async discover(opts: {
    type?: 'movie' | 'tv' | 'all';
    page?: number;
    year?: number;
    region?: string;
    originalLanguage?: string;
    genreId?: number;
    rating?: string;
    sort?: string;
  }): Promise<TmdbSearchResult> {
    const type = opts.type ?? 'movie';
    const page = Math.max(1, opts.page ?? 1);
    const common = {
      page,
      year: opts.year,
      region: opts.region,
      originalLanguage: opts.originalLanguage,
      genreId: opts.genreId,
      rating: opts.rating,
      sort: opts.sort,
    };

    if (type === 'movie' || type === 'tv') {
      return this.discoverOne(type, common);
    }

    const [movies, tv] = await Promise.all([
      this.discoverOne('movie', common),
      this.discoverOne('tv', common),
    ]);
    const results = [...movies.results, ...tv.results]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, TMDB_SEARCH_FILTERS.limit);

    return {
      page,
      limit: TMDB_SEARCH_FILTERS.limit,
      totalPages: Math.max(movies.totalPages, tv.totalPages),
      totalResults: movies.totalResults + tv.totalResults,
      type: 'all',
      results,
    };
  }

  /**
   * Resolve title (+ optional year) → slim match { id, mediaType, title, year }.
   * Accepts q="Salaar 2023" or title + year separately.
   */
  async resolveByTitle(opts: {
    q?: string;
    title?: string;
    year?: number;
  }): Promise<
    | { status: 'success'; match: { id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null } }
    | { status: 'failed'; match: null }
  > {
    let title = (opts.title ?? '').trim();
    let year = opts.year;

    if (opts.q?.trim()) {
      const parsed = parseTitleYear(opts.q);
      if (!title) title = parsed.title;
      if (year == null) year = parsed.year;
    }

    if (!title) throw AppError.badRequest('Provide q (e.g. "Salaar 2023") or title');

    // Search movie + tv together — caller doesn't know the media type
    let { items } = await this.fetchSearchPage('all', title, 1, { year });
    if (!items.length && year != null) {
      ({ items } = await this.fetchSearchPage('all', title, 1, {}));
    }

    const hit = pickBestMatch(items, title, year);
    if (!hit) return { status: 'failed', match: null };

    return {
      status: 'success',
      match: {
        id: hit.id,
        mediaType: hit.mediaType,
        title: hit.title,
        year: hit.year,
      },
    };
  }

  private mapVideos(data: { results?: Array<Record<string, unknown>> }) {
    return (data.results ?? []).map((v) => {
      const site = String(v.site ?? '');
      const key = String(v.key ?? '');
      return {
        id: v.id,
        name: v.name ?? null,
        key,
        site,
        type: v.type ?? null,
        official: v.official ?? null,
        youtubeUrl:
          site.toLowerCase() === 'youtube' && key
            ? `https://www.youtube.com/watch?v=${key}`
            : null,
      };
    });
  }

  private mapImages(data: {
    backdrops?: Array<Record<string, unknown>>;
    posters?: Array<Record<string, unknown>>;
    logos?: Array<Record<string, unknown>>;
  }) {
    return {
      backdrops: (data.backdrops ?? []).map((img) => ({
        ...img,
        fileUrl: posterUrl(img.file_path as string, 'w780'),
      })),
      posters: (data.posters ?? []).map((img) => ({
        ...img,
        fileUrl: posterUrl(img.file_path as string, 'w500'),
      })),
      logos: (data.logos ?? []).map((img) => ({
        ...img,
        fileUrl: posterUrl(img.file_path as string, 'w500'),
      })),
    };
  }

  private mapCredits(data: {
    cast?: Array<Record<string, unknown>>;
    crew?: Array<Record<string, unknown>>;
  }) {
    return {
      cast: (data.cast ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        character: p.character ?? null,
        order: p.order ?? null,
        profileUrl: posterUrl(p.profile_path as string, 'w185'),
      })),
      crew: (data.crew ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        job: p.job ?? null,
        department: p.department ?? null,
        profileUrl: posterUrl(p.profile_path as string, 'w185'),
      })),
    };
  }

  /**
   * Full movie or TV details by id (one TMDB call via append_to_response).
   */
  async getDetails(id: number, type: 'movie' | 'tv') {
    if (type === 'movie') {
      const data = await this.request<Record<string, unknown>>(`/movie/${id}`, {
        append_to_response:
          'videos,images,credits,keywords,watch/providers,external_ids,similar,release_dates',
      });
      const videos = this.mapVideos(
        (data.videos as { results?: Array<Record<string, unknown>> }) ?? {},
      );
      const similarRaw = (data.similar as TmdbPage | undefined) ?? { results: [] };
      return {
        id: Number(data.id),
        mediaType: 'movie' as const,
        title: String(data.title ?? ''),
        overview: (data.overview as string) ?? null,
        tagline: (data.tagline as string) ?? null,
        status: (data.status as string) ?? null,
        runtime: (data.runtime as number) ?? null,
        releaseDate: (data.release_date as string) || null,
        year: yearFrom(data.release_date as string),
        posterUrl: posterUrl(data.poster_path as string, 'w500'),
        backdropUrl: posterUrl(data.backdrop_path as string, 'w780'),
        voteAverage: (data.vote_average as number) ?? null,
        voteCount: (data.vote_count as number) ?? null,
        popularity: (data.popularity as number) ?? null,
        originalLanguage: (data.original_language as string) ?? null,
        homepage: (data.homepage as string) ?? null,
        imdbId: (data.imdb_id as string) ?? null,
        genres: (data.genres as Array<{ id: number; name: string }>) ?? [],
        budget: (data.budget as number) ?? null,
        revenue: (data.revenue as number) ?? null,
        videos,
        trailers: videos.filter((v) => String(v.type).toLowerCase() === 'trailer'),
        images: this.mapImages(
          (data.images as {
            backdrops?: Array<Record<string, unknown>>;
            posters?: Array<Record<string, unknown>>;
            logos?: Array<Record<string, unknown>>;
          }) ?? {},
        ),
        credits: this.mapCredits(
          (data.credits as {
            cast?: Array<Record<string, unknown>>;
            crew?: Array<Record<string, unknown>>;
          }) ?? {},
        ),
        keywords:
          (data.keywords as { keywords?: Array<{ id: number; name: string }> })?.keywords ?? [],
        watchProviders:
          (data['watch/providers'] as { results?: Record<string, unknown> })?.results ?? {},
        externalIds: (data.external_ids as Record<string, unknown>) ?? {},
        releaseDates: (data.release_dates as { results?: unknown[] })?.results ?? [],
        similar: (similarRaw.results ?? [])
          .map((r) => mapItem(r, 'movie'))
          .filter((x): x is TmdbSearchItem => x != null),
      };
    }

    const data = await this.request<Record<string, unknown>>(`/tv/${id}`, {
      append_to_response:
        'videos,images,credits,keywords,watch/providers,external_ids,similar,content_ratings',
    });
    const videos = this.mapVideos(
      (data.videos as { results?: Array<Record<string, unknown>> }) ?? {},
    );
    const similarRaw = (data.similar as TmdbPage | undefined) ?? { results: [] };
    return {
      id: Number(data.id),
      mediaType: 'tv' as const,
      title: String(data.name ?? ''),
      overview: (data.overview as string) ?? null,
      tagline: (data.tagline as string) ?? null,
      status: (data.status as string) ?? null,
      runtime: null as number | null,
      releaseDate: (data.first_air_date as string) || null,
      year: yearFrom(data.first_air_date as string),
      posterUrl: posterUrl(data.poster_path as string, 'w500'),
      backdropUrl: posterUrl(data.backdrop_path as string, 'w780'),
      voteAverage: (data.vote_average as number) ?? null,
      voteCount: (data.vote_count as number) ?? null,
      popularity: (data.popularity as number) ?? null,
      originalLanguage: (data.original_language as string) ?? null,
      homepage: (data.homepage as string) ?? null,
      imdbId: null as string | null,
      genres: (data.genres as Array<{ id: number; name: string }>) ?? [],
      numberOfSeasons: (data.number_of_seasons as number) ?? null,
      numberOfEpisodes: (data.number_of_episodes as number) ?? null,
      seasons: data.seasons ?? [],
      episodeRunTime: data.episode_run_time ?? [],
      videos,
      trailers: videos.filter((v) => String(v.type).toLowerCase() === 'trailer'),
      images: this.mapImages(
        (data.images as {
          backdrops?: Array<Record<string, unknown>>;
          posters?: Array<Record<string, unknown>>;
          logos?: Array<Record<string, unknown>>;
        }) ?? {},
      ),
      credits: this.mapCredits(
        (data.credits as {
          cast?: Array<Record<string, unknown>>;
          crew?: Array<Record<string, unknown>>;
        }) ?? {},
      ),
      keywords:
        (data.keywords as { results?: Array<{ id: number; name: string }> })?.results ?? [],
      watchProviders:
        (data['watch/providers'] as { results?: Record<string, unknown> })?.results ?? {},
      externalIds: (data.external_ids as Record<string, unknown>) ?? {},
      contentRatings: (data.content_ratings as { results?: unknown[] })?.results ?? [],
      similar: (similarRaw.results ?? [])
        .map((r) => mapItem(r, 'tv'))
        .filter((x): x is TmdbSearchItem => x != null),
    };
  }
}
