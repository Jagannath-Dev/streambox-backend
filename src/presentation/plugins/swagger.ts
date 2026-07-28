import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../../shared/config/env.js';

/** OpenAPI generator — register before routes (non-encapsulated). */
export const swaggerPlugin = fp(async (app: FastifyInstance) => {
  const env = app.config as Env;

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Streambox API',
        description:
          'Streambox backend — Supabase movies catalog, TMDB autocomplete, Seedr.cc transfers.',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${env.PORT}`, description: 'Localhost' },
        ...(env.PUBLIC_URL
          ? [{ url: env.PUBLIC_URL, description: 'Server' }]
          : []),
        { url: '/', description: 'Current host' },
      ],
      tags: [
        { name: 'Health', description: 'Liveness' },
        { name: 'Cache', description: 'Redis cache reset' },
        { name: 'Movies', description: 'Supabase movies search, filters, pagination' },
        { name: 'TMDB', description: 'TMDB search + autocomplete' },
        { name: 'Seedr', description: 'Seedr.cc user, files, magnet transfers' },
      ],
    },
  });
}, { name: 'streambox-swagger' });

/** Swagger UI — register after routes. */
export const swaggerUiPlugin = fp(async (app: FastifyInstance) => {
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'none',
      deepLinking: true,
      tryItOutEnabled: true,
      filter: true,
      displayRequestDuration: true,
      defaultModelsExpandDepth: -1,
    },
    staticCSP: true,
    theme: {
      title: 'Streambox API Docs',
    },
  });

  app.get('/', { schema: { hide: true } }, async (_req, reply) => reply.redirect('/docs'));
}, { name: 'streambox-swagger-ui', dependencies: ['@fastify/swagger'] });
