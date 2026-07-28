import type { FastifyInstance } from 'fastify';
import type { RedisCache } from '../../infrastructure/redis/redis-cache.js';
import { successResponse } from '../../shared/http/api-response.js';

export async function healthRoutes(app: FastifyInstance, cache: RedisCache) {
  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check',
    },
  }, async () => {
    let redis = 'down';
    try {
      redis = await cache.ping();
    } catch {
      redis = 'down';
    }
    return successResponse(
      {
        status: 'ok',
        env: app.config.NODE_ENV,
        uptime: process.uptime(),
        redis,
      },
      'Service healthy',
    );
  });
}
