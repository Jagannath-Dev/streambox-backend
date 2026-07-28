import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CACHE_TTL,
  cacheKey,
  type RedisCache,
} from '../../infrastructure/redis/redis-cache.js';
import {
  TMDB_SEARCH_FILTERS,
  type TmdbService,
} from '../../infrastructure/tmdb/tmdb.service.js';
import { AppError } from '../../shared/errors/app-error.js';
import { successResponse } from '../../shared/http/api-response.js';

const TYPE_IDS = TMDB_SEARCH_FILTERS.types.map((t) => t.id) as [
  'all',
  'movie',
  'tv',
];
const SCOPE_IDS = TMDB_SEARCH_FILTERS.scopes.map((s) => s.id) as [
  'title',
  'actor',
  'director',
  'writer',
  'keyword',
];
const RATING_IDS = TMDB_SEARCH_FILTERS.ratings.map((r) => r.id) as [
  'any',
  '6',
  '7',
  '8',
];
const SORT_IDS = TMDB_SEARCH_FILTERS.sorts.map((s) => s.id) as [
  'popular',
  'newest',
  'oldest',
  'top_rated',
];

const searchSchema = z.object({
  q: z.string().trim().min(1).max(100),
  type: z.enum(TYPE_IDS).default('all'),
  scope: z.enum(SCOPE_IDS).default('title'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  region: z.string().trim().length(2).optional(),
  originalLanguage: z.string().trim().min(2).max(5).optional(),
  genreId: z.coerce.number().int().positive().optional(),
  rating: z.enum(RATING_IDS).optional(),
});

const discoverSchema = z.object({
  type: z.enum(TYPE_IDS).default('movie'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  region: z.string().trim().length(2).optional(),
  originalLanguage: z.string().trim().min(2).max(5).optional(),
  genreId: z.coerce.number().int().positive().optional(),
  rating: z.enum(RATING_IDS).optional(),
  sort: z.enum(SORT_IDS).default('popular'),
});

const autocompleteSchema = z.object({
  q: z.string().trim().min(1).max(100),
  type: z.enum(TYPE_IDS).default('movie'),
  limit: z.coerce.number().int().min(1).max(10).default(10),
});

export async function tmdbRoutes(app: FastifyInstance, tmdb: TmdbService, cache: RedisCache) {
  app.get('/tmdb/filters', {
    schema: {
      tags: ['TMDB'],
      summary: 'All TMDB search filter options',
      description: [
        'Static app filters + live TMDB genres.',
        'scopes: title | actor | director | writer | keyword — used by GET /tmdb/search',
      ].join(' '),
    },
  }, async () => {
    const { value, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('tmdb:filters', { v: 4 }),
      CACHE_TTL.tmdbFilters,
      () => tmdb.getFilters(),
    );
    return successResponse(value, 'TMDB filters fetched', { cache: cacheStatus });
  });

  app.get('/tmdb/discover', {
    schema: {
      tags: ['TMDB'],
      summary: 'Discover movies / TV / both (filters)',
      description: [
        'One discover API for movie, tv, or all. Limit 10 per page.',
        'Use GET /tmdb/filters for option values (types, years, regions, genres, ratings, sorts).',
        'Filters: type, year, region, originalLanguage, genreId, rating, sort',
      ].join('\n'),
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...TYPE_IDS], default: 'movie' },
          page: { type: 'integer', minimum: 1, default: 1 },
          year: { type: 'integer', minimum: 1900, maximum: 2100 },
          region: { type: 'string', minLength: 2, maxLength: 2 },
          originalLanguage: { type: 'string', description: 'e.g. te, hi, ml, en' },
          genreId: { type: 'integer', description: 'From filters.movieGenres / tvGenres' },
          rating: { type: 'string', enum: [...RATING_IDS] },
          sort: { type: 'string', enum: [...SORT_IDS], default: 'popular' },
        },
      },
    },
  }, async (req) => {
    const query = discoverSchema.parse(req.query);
    const { value: data, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('tmdb:discover', query),
      CACHE_TTL.tmdbDiscover,
      () => tmdb.discover(query),
    );
    return successResponse(data.results, 'TMDB discover results', {
      page: data.page,
      limit: data.limit,
      totalPages: data.totalPages,
      totalResults: data.totalResults,
      hasNext: data.page < data.totalPages,
      hasPrev: data.page > 1 && data.totalPages > 0,
      cache: cacheStatus,
      filters: {
        type: query.type,
        year: query.year ?? null,
        region: query.region ?? null,
        originalLanguage: query.originalLanguage ?? null,
        genreId: query.genreId ?? null,
        rating: query.rating ?? null,
        sort: query.sort,
        limit: data.limit,
      },
    });
  });

  app.get('/tmdb/search', {
    schema: {
      tags: ['TMDB'],
      summary: 'Unified search (movie / tv / all)',
      description: [
        'One search API for movies, TV, or both. Limit 10 per page.',
        'Use GET /tmdb/filters for all option values.',
        'scope: title (default) | actor | director | writer | keyword',
        'Filters: type, scope, year, region, originalLanguage, genreId, rating',
      ].join('\n'),
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: [...TYPE_IDS], default: 'all' },
          scope: {
            type: 'string',
            enum: [...SCOPE_IDS],
            default: 'title',
            description: 'Search by title, actor, director, writer, or keyword',
          },
          page: { type: 'integer', minimum: 1, default: 1 },
          year: { type: 'integer', minimum: 1900, maximum: 2100 },
          region: { type: 'string', minLength: 2, maxLength: 2, description: 'ISO country from filters.countries' },
          originalLanguage: {
            type: 'string',
            description: 'ISO language from filters.originalLanguages / languages',
          },
          genreId: {
            type: 'integer',
            description: 'TMDB genre id from filters.movieGenres or filters.tvGenres',
          },
          rating: {
            type: 'string',
            enum: [...RATING_IDS],
            description: 'Min vote average from filters.ratings',
          },
        },
      },
    },
  }, async (req) => {
    const query = searchSchema.parse(req.query);
    const { value: data, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('tmdb:search', query),
      CACHE_TTL.tmdbSearch,
      () => tmdb.search(query),
    );
    return successResponse(data.results, 'TMDB search results', {
      page: data.page,
      limit: data.limit,
      totalPages: data.totalPages,
      totalResults: data.totalResults,
      hasNext: data.page < data.totalPages,
      hasPrev: data.page > 1 && data.totalPages > 0,
      cache: cacheStatus,
      filters: {
        q: query.q,
        type: query.type,
        scope: query.scope,
        year: query.year ?? null,
        region: query.region ?? null,
        originalLanguage: query.originalLanguage ?? null,
        genreId: query.genreId ?? null,
        rating: query.rating ?? null,
        limit: data.limit,
      },
    });
  });

  app.get('/tmdb/resolve', {
    schema: {
      tags: ['TMDB'],
      summary: 'Resolve title + year → id / title / year',
      description: [
        'Identify a movie or TV by title and year (searches both — no type needed).',
        'Use q="Salaar 2023" or title=Salaar&year=2023.',
        'On match returns only: id, mediaType, title, year. On miss: status=failed.',
      ].join(' '),
      querystring: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            minLength: 1,
            description: 'Title, optionally with year: "Salaar 2023"',
          },
          title: { type: 'string', minLength: 1, description: 'Title without year' },
          year: { type: 'integer', minimum: 1900, maximum: 2100 },
        },
      },
    },
  }, async (req) => {
    const query = z
      .object({
        q: z.string().trim().min(1).max(120).optional(),
        title: z.string().trim().min(1).max(100).optional(),
        year: z.coerce.number().int().min(1900).max(2100).optional(),
      })
      .refine((v) => Boolean(v.q || v.title), {
        message: 'Provide q or title',
      })
      .parse(req.query);

    const { value, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('tmdb:resolve', { ...query, v: 3 }),
      CACHE_TTL.tmdbResolve,
      () => tmdb.resolveByTitle(query),
    );

    if (value.status === 'failed') {
      return successResponse({ status: 'failed' }, 'No matching movie/TV found', {
        cache: cacheStatus,
      });
    }

    return successResponse(value.match, 'Matched movie/TV', { cache: cacheStatus });
  });

  app.get<{ Params: { id: string } }>('/tmdb/details/:id', {
    schema: {
      tags: ['TMDB'],
      summary: 'Movie or TV details by id',
      description: [
        'One API for full details. Pass type=movie or type=tv.',
        'Includes trailers, images, cast/crew, keywords, providers, similar, etc.',
      ].join(' '),
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: '^[1-9][0-9]*$' } },
      },
      querystring: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['movie', 'tv'] },
        },
      },
    },
  }, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw AppError.badRequest('id must be a positive integer');
    const { type } = z.object({ type: z.enum(['movie', 'tv']) }).parse(req.query);
    const { value, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('tmdb:details', { id, type }),
      CACHE_TTL.tmdbDetails,
      () => tmdb.getDetails(id, type),
    );
    return successResponse(value, 'TMDB details fetched', { cache: cacheStatus });
  });

  app.get('/tmdb/autocomplete', {
    schema: {
      tags: ['TMDB'],
      summary: 'Autocomplete movie / TV search (TMDB)',
      description: [
        'Typeahead suggestions via TMDB search.',
        'Returns slim cards: id, mediaType, title, year, posterUrl (max 10).',
        'type=movie | tv | all — default movie',
      ].join('\n'),
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, description: 'Search text (typeahead)' },
          type: {
            type: 'string',
            enum: [...TYPE_IDS],
            default: 'movie',
          },
          limit: { type: 'integer', minimum: 1, maximum: 10, default: 10 },
        },
      },
    },
  }, async (req) => {
    const query = autocompleteSchema.parse(req.query);
    const { value: results, cache: cacheStatus } = await cache.getOrSet(
      cacheKey('tmdb:autocomplete', query),
      CACHE_TTL.tmdbAutocomplete,
      () => tmdb.autocomplete(query),
    );
    return successResponse(results, 'TMDB autocomplete', {
      cache: cacheStatus,
      count: results.length,
      filters: query,
    });
  });
}
