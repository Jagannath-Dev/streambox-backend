import type { FastifyInstance, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { failedResponse } from '../../shared/http/api-response.js';

function mapError(err: unknown): { statusCode: number; body: ReturnType<typeof failedResponse> } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: failedResponse(err.message, err.code, err.details),
    };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      body: failedResponse('Validation failed', 'BAD_REQUEST', err.flatten()),
    };
  }

  const fastifyErr = err as FastifyError;
  if (fastifyErr?.validation) {
    return {
      statusCode: 400,
      body: failedResponse('Validation failed', 'BAD_REQUEST', fastifyErr.validation),
    };
  }

  if (typeof fastifyErr?.statusCode === 'number' && fastifyErr.statusCode < 500) {
    return {
      statusCode: fastifyErr.statusCode,
      body: failedResponse(fastifyErr.message || 'Request failed', 'BAD_REQUEST'),
    };
  }

  return {
    statusCode: 500,
    body: failedResponse('Internal server error', 'INTERNAL_ERROR'),
  };
}

export async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    const mapped = mapError(err);
    if (mapped.statusCode >= 500) {
      app.log.error({ err }, 'Unhandled error');
    } else {
      app.log.warn({ err }, 'Request error');
    }
    return reply.status(mapped.statusCode).send(mapped.body);
  });

  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send(failedResponse('Route not found', 'NOT_FOUND'));
  });
}
