/** Mirrors StreamBox app movie filter sheets. */

export const MOVIE_LANGUAGES = [
  'Telugu',
  'Telugu Dubbed',
  'Hindi',
  'English',
  'Tamil',
  'Malayalam',
  'Kannada',
] as const;

/** Same idea as TMDB scopes — All first, then Title, then people / keyword. */
export const MOVIE_SEARCH_SCOPE_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'title', label: 'Title' },
  { id: 'actor', label: 'Actor' },
  { id: 'director', label: 'Director' },
  { id: 'writer', label: 'Writer' },
  { id: 'cast', label: 'Cast' },
  { id: 'keyword', label: 'Keyword' },
] as const;

export const MOVIE_SEARCH_SCOPES = [
  'all',
  'title',
  'actor',
  'director',
  'writer',
  'cast',
  'keyword',
] as const;

export const MOVIE_SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'year_desc', label: 'Year (new→old)' },
  { id: 'year_asc', label: 'Year (old→new)' },
  { id: 'az', label: 'A–Z' },
  { id: 'za', label: 'Z–A' },
] as const;

export const MOVIE_SORTS = [
  'newest',
  'oldest',
  'year_desc',
  'year_asc',
  'az',
  'za',
] as const;

export const MOVIE_GENRES = [
  'Drama',
  'Thriller',
  'Action',
  'Comedy',
  'Crime',
  'Romance',
  'Adventure',
  'Horror',
  'Mystery',
  'Family',
  'Fantasy',
  'Sci-Fi',
  'Animation',
  'Suspense',
  'Biography',
  'Sport',
  'Musical',
  'War',
  'Documentary',
] as const;

export const MOVIE_COUNTRIES = [
  'India',
  'USA',
  'China',
  'South Korea',
  'United States',
  'Japan',
  'Thailand',
  'Spain',
  'France',
  'Russia',
  'Italy',
  'UK',
  'United Kingdom',
  'Canada',
  'Germany',
  'Australia',
  'Mexico',
  'Malaysia',
  'Norway',
  'Sweden',
  'Turkey',
  'Indonesia',
  'Argentina',
  'Vietnam',
  'Iran',
  'Hong Kong',
] as const;

export const MOVIE_QUALITIES = [
  'HDRip',
  'BRRip',
  'DVDScr',
  'HDTVRip',
  'DVDRip',
  'PREHD',
  'HD',
  'HDTC',
  'SDTVRip',
  'HDTS',
] as const;

/** Longer tokens first so HDRip wins over HD. */
const QUALITY_MATCHERS = [...MOVIE_QUALITIES].sort((a, b) => b.length - a.length);

/** Longer first so "Telugu Dubbed" wins over "Telugu". */
const LANGUAGE_MATCHERS = [
  ...MOVIE_LANGUAGES,
  'Tamil Dubbed',
  'Hindi Dubbed',
  'Malayalam Dubbed',
  'Kannada Dubbed',
  'English Dubbed',
].sort((a, b) => b.length - a.length);

/**
 * Scraped `movie_quality` is often wrong (title words like "Part" / "Ceasefire").
 * Prefer a known quality from the DB field, else parse from list/page title.
 */
export function resolveMovieQuality(
  movieQuality: string | null | undefined,
  ...titles: Array<string | null | undefined>
): string | null {
  const known = (value: string | null | undefined) => {
    if (!value?.trim()) return null;
    const v = value.trim().toLowerCase();
    return QUALITY_MATCHERS.find((q) => q.toLowerCase() === v) ?? null;
  };

  const fromField = known(movieQuality);
  if (fromField) return fromField;

  const haystack = titles.filter(Boolean).join(' ');
  if (!haystack) return null;

  for (const q of QUALITY_MATCHERS) {
    // word-boundary-ish match (spaces / punctuation around quality)
    const re = new RegExp(`(?:^|[^a-z0-9])${q}(?:[^a-z0-9]|$)`, 'i');
    if (re.test(haystack)) return q;
  }
  return null;
}

/**
 * DB `language` is often null. Parse from list/page title, e.g. `[Telugu]`.
 */
export function resolveMovieLanguage(
  language: string | null | undefined,
  ...titles: Array<string | null | undefined>
): string | null {
  if (language?.trim()) return language.trim();

  const haystack = titles.filter(Boolean).join(' ');
  if (!haystack) return null;

  const tags = [...haystack.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
  for (const tag of tags) {
    const hit = LANGUAGE_MATCHERS.find((l) => l.toLowerCase() === tag.toLowerCase());
    if (hit) return hit;
  }

  for (const l of LANGUAGE_MATCHERS) {
    const re = new RegExp(`(?:^|[^a-z0-9])${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i');
    if (re.test(haystack)) return l;
  }
  return null;
}

/** Language list year filter: All + 2026 → 2000 */
export function movieYears(from = 2026, to = 2000): number[] {
  const years: number[] = [];
  for (let y = from; y >= to; y -= 1) years.push(y);
  return years;
}

export function getMovieFilterCatalog() {
  return {
    homeLanguages: [...MOVIE_LANGUAGES, 'Other'],
    languages: ['All', ...MOVIE_LANGUAGES],
    years: ['All', ...movieYears()],
    scopes: MOVIE_SEARCH_SCOPE_OPTIONS.map((s) => ({ id: s.id, label: s.label })),
    sorts: MOVIE_SORT_OPTIONS.map((s) => ({ id: s.id, label: s.label })),
    genres: ['All', ...MOVIE_GENRES],
    countries: ['All', ...MOVIE_COUNTRIES],
    qualities: ['All', ...MOVIE_QUALITIES],
    limit: 20,
  };
}

/** Escape PostgREST filter wildcards / separators in user input. */
export function escapeIlike(term: string): string {
  return term.replace(/[%_,]/g, '').trim();
}
