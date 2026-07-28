import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import type { Env } from './shared/config/env.js';
import { createRedisCache } from './infrastructure/redis/redis-cache.js';
import { SeedrClient } from './infrastructure/seedr/seedr-client.js';
import { createSupabaseClient } from './infrastructure/supabase/client.js';
import { SupabaseMovieRepository } from './infrastructure/supabase/movie-repository.js';
import { SupabaseSeedrDbRepository } from './infrastructure/supabase/seedr-db-repository.js';
import { TmdbService } from './infrastructure/tmdb/tmdb.service.js';
import { errorHandlerPlugin } from './presentation/plugins/error-handler.js';
import { swaggerPlugin, swaggerUiPlugin } from './presentation/plugins/swagger.js';
import { cacheRoutes } from './presentation/routes/cache.routes.js';
import { healthRoutes } from './presentation/routes/health.routes.js';
import { movieRoutes } from './presentation/routes/movies.routes.js';
import { seedrRoutes } from './presentation/routes/seedr.routes.js';
import { tmdbRoutes } from './presentation/routes/tmdb.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Env;
  }
}

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    // Behind nginx / cloud LB when using PUBLIC_URL / server host
    trustProxy: true,
  });

  app.decorate('config', env);

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(swaggerPlugin);
  await app.register(errorHandlerPlugin);

  const cache = await createRedisCache(env, app.log);
  app.addHook('onClose', async () => {
    await cache.close();
  });

  const supabase = createSupabaseClient(env);
  const seedrDb = new SupabaseSeedrDbRepository(supabase);
  const seedr = new SeedrClient(env, seedrDb);
  const movies = new SupabaseMovieRepository(supabase, env.MOVIES_RULSZ);
  const tmdb = new TmdbService(env);

  await healthRoutes(app, cache);
  await app.register(
    async (api) => {
      await cacheRoutes(api, cache);
      await movieRoutes(api, movies, cache);
      await tmdbRoutes(api, tmdb, cache);
      await seedrRoutes(api, seedr);
    },
    { prefix: '/api/v1' },
  );
  await app.register(swaggerUiPlugin);

  return app;
}
