import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toMovieCard } from '../../domain/entities/movie.js';
import {
  CACHE_TTL,
  cacheKey,
  type RedisCache,
} from '../../infrastructure/redis/redis-cache.js';
import type { SupabaseMovieRepository } from '../../infrastructure/supabase/movie-repository.js';
import { AppError } from '../../shared/errors/app-error.js';
import { successResponse } from '../../shared/http/api-response.js';
import {
  getMovieFilterCatalog,
  MOVIE_GENRES,
  MOVIE_LANGUAGES,
  MOVIE_QUALITIES,
  MOVIE_SEARCH_SCOPES,
  MOVIE_SORTS,
} from '../../shared/movies/filters.js';

const LANGUAGE_FILTERS = ['All', ...MOVIE_LANGUAGES, 'Other'] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  scope: z.enum(MOVIE_SEARCH_SCOPES).default('title'),
  sort: z.enum(MOVIE_SORTS).default('newest'),
  language: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  quality: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listMeta = (result: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}) => ({
  page: result.page,
  limit: result.limit,
  total: result.total,
  totalPages: result.totalPages,
  hasNext: result.hasNext,
  hasPrev: result.hasPrev,
});

export async function movieRoutes(
  app: FastifyInstance,
  movies: SupabaseMovieRepository,
  cache: RedisCache,
) {
  app.get('/movies/filters', {
    schema: {
      tags: ['Movies'],
      summary: 'Filter options (matches app filter sheets)',
      description: [
        'Home languages, scopes (title/actor/director/writer/cast/keyword),',
        'sorts, years 2026→2000, genres, countries, qualities, limit.',
      ].join(' '),
    },
  }, async () => successResponse(getMovieFilterCatalog(), 'Movie filters fetched'));

  app.get('/movies/search', {
    schema: {
      tags: ['Movies'],
      summary: 'Search movies (slim card fields only)',
      description: [
        'Returns: id (uuid), movieName, listTitle, year, quality, poster, language, createdAt, updatedAt',
        'Use GET /movies/filters for scopes, sorts, languages, genres, qualities.',
        'Use id with GET /movies/detail?detailUrl={id} for full details + torrents',
        'Use id with GET /movies/torrents?id={id} for torrents only',
        `scope: ${MOVIE_SEARCH_SCOPES.join(' | ')}`,
        `sort: ${MOVIE_SORTS.join(' | ')}`,
        `language: ${LANGUAGE_FILTERS.join(' | ')}`,
        `genre: ${MOVIE_GENRES.slice(0, 5).join(', ')}…`,
        `quality: ${MOVIE_QUALITIES.join(', ')}`,
      ].join('\n'),
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search text' },
          scope: {
            type: 'string',
            enum: [...MOVIE_SEARCH_SCOPES],
            default: 'title',
            description: 'Title | All | Actor | Director | Writer | Cast | Keyword',
          },
          sort: {
            type: 'string',
            enum: [...MOVIE_SORTS],
            default: 'newest',
            description: 'From filters.sorts',
          },
          language: {
            type: 'string',
            enum: [...LANGUAGE_FILTERS],
            default: 'All',
            description: 'Filter by language (same list as GET /movies/filters)',
          },
          year: { type: 'integer', minimum: 2000, maximum: 2100 },
          quality: { type: 'string' },
          genre: { type: 'string' },
          category: { type: 'string' },
          country: { type: 'string' },
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
  }, async (req) => {
    const query = searchQuerySchema.parse(req.query);
    const { value: result, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('movies:search', { ...query, v: 5 }),
      CACHE_TTL.moviesSearch,
      () => movies.search(query),
    );
    return successResponse(result.items.map(toMovieCard), 'Movies search results', {
      ...listMeta(result),
      cache: cacheStatus,
      filters: {
        q: query.q ?? null,
        scope: query.scope,
        sort: query.sort,
        language: query.language ?? 'All',
        year: query.year ?? 'All',
        quality: query.quality ?? 'All',
        genre: query.genre ?? 'All',
        country: query.country ?? 'All',
        category: query.category ?? null,
      },
    });
  });

  app.get('/movies/detail', {
    schema: {
      tags: ['Movies'],
      summary: 'Get movie details (uuid or detail_url)',
      description:
        'Pass `detailUrl` as either the movie `uid` (uuid from search) or the full source page URL. Includes `torrents` sorted by size ascending.',
      querystring: {
        type: 'object',
        required: ['detailUrl'],
        properties: {
          detailUrl: {
            type: 'string',
            minLength: 1,
            description: 'movies.uid (uuid) or full detail_url',
          },
        },
      },
    },
  }, async (req) => {
    const { detailUrl } = z.object({ detailUrl: z.string().trim().min(1) }).parse(req.query);
    const { value, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('movies:detail', { detailUrl, v: 3 }),
      CACHE_TTL.moviesDetail,
      async () => {
        const movie = UUID_RE.test(detailUrl)
          ? await movies.findByUid(detailUrl)
          : await movies.findByDetailUrl(detailUrl);
        if (!movie) throw AppError.notFound('Movie not found', { detailUrl });
        const torrents = await movies.listTorrentsByDetailUrl(movie.detailUrl);
        return { ...movie, torrents };
      },
    );
    return successResponse(value, 'Movie details fetched', { cache: cacheStatus });
  });

  app.get('/movies/torrents', {
    schema: {
      tags: ['Movies'],
      summary: 'Get torrents details (uuid)',
      description:
        'Pass movie `id` (uuid from search). Returns only torrents (quality, size, magnet), sorted by size ascending — no movie metadata.',
      querystring: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            minLength: 36,
            maxLength: 36,
            description: 'movies.uid (uuid from search)',
          },
        },
      },
    },
  }, async (req) => {
    const { id } = z
      .object({ id: z.string().trim().regex(UUID_RE, 'id must be a movie uuid') })
      .parse(req.query);
    const { value: torrents, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('movies:torrents', { id }),
      CACHE_TTL.moviesTorrents,
      async () => {
        const movie = await movies.findByUid(id);
        if (!movie) throw AppError.notFound('Movie not found', { id });
        const rows = await movies.listTorrentsByDetailUrl(movie.detailUrl);
        return rows.map(({ id: torrentId, quality, sizeLabel, magnetUri, sortOrder }) => ({
          id: torrentId,
          quality,
          sizeLabel,
          magnetUri,
          sortOrder,
        }));
      },
    );
    return successResponse(torrents, 'Torrents fetched', {
      movieId: id,
      count: torrents.length,
      cache: cacheStatus,
    });
  });
}
