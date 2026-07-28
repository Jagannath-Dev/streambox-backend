import type { FastifyInstance } from 'fastify';
import type { RedisCache } from '../../infrastructure/redis/redis-cache.js';
import { successResponse } from '../../shared/http/api-response.js';

export async function cacheRoutes(app: FastifyInstance, cache: RedisCache) {
  app.post('/cache/reset', {
    schema: {
      tags: ['Cache'],
      summary: 'Reset Redis cache',
      description:
        'Flushes all keys in the Redis DB used by this API (movies + TMDB cache). No-op when Redis is bypassed.',
    },
  }, async () => {
    const result = await cache.flush();
    return successResponse(result, 'Redis cache reset');
  });
}
