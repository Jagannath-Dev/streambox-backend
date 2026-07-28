import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SeedrClient } from '../../infrastructure/seedr/seedr-client.js';
import { AppError } from '../../shared/errors/app-error.js';
import { successResponse } from '../../shared/http/api-response.js';

const magnetBodySchema = z.object({
  magnet: z.string().min(10),
});

const deleteBodySchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(['file', 'folder', 'torrent']),
        id: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
});

export async function seedrRoutes(app: FastifyInstance, seedr: SeedrClient) {
  app.get('/seedr/user', {
    schema: { tags: ['Seedr'], summary: 'Seedr account info' },
  }, async () => successResponse(await seedr.getUser(), 'Seedr user fetched'));

  app.get('/seedr/library', {
    schema: {
      tags: ['Seedr'],
      summary: 'Library details (space, loading torrents, videos) — app getLibrary()',
      description:
        'Poll every 6–8s while `loading.length > 0`. When a torrent finishes it leaves `loading` and appears in `videos`.',
    },
  }, async () => successResponse(await seedr.getLibrary(), 'Seedr library fetched'));

  app.get('/seedr/folders', {
    schema: {
      tags: ['Seedr'],
      summary: 'List folders (root)',
      description: 'Returns folder id/name/size from Seedr root. Use GET /seedr/folders/{id} for contents.',
    },
  }, async () => {
    const data = await seedr.listFolders();
    return successResponse(data, 'Seedr folders listed', { count: data.count });
  });

  app.get<{ Params: { id: string } }>('/seedr/folders/:id', {
    schema: {
      tags: ['Seedr'],
      summary: 'Folder details by id',
      description: 'Files, nested folders, and loading torrents inside this folder.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Seedr folder id' } },
      },
    },
  }, async (req) => {
    const id = req.params.id.trim();
    if (!id) throw AppError.badRequest('folder id is required');
    const details = await seedr.getFolderDetails(id);
    return successResponse(details, 'Seedr folder details fetched');
  });

  app.post('/seedr/magnet', {
    schema: {
      tags: ['Seedr'],
      summary: 'Add magnet (resource.php add_torrent)',
      body: {
        type: 'object',
        required: ['magnet'],
        properties: {
          magnet: { type: 'string', examples: ['magnet:?xt=urn:btih:...'] },
        },
      },
    },
  }, async (req) => {
    const body = magnetBodySchema.parse(req.body);
    if (!body.magnet.startsWith('magnet:')) {
      throw AppError.badRequest('magnet must start with magnet:');
    }
    const result = await seedr.addMagnet(body.magnet);
    return successResponse(result, 'Magnet added — check /seedr/library loading[]');
  });

  app.get<{ Params: { id: string } }>('/seedr/files/:id', {
    schema: {
      tags: ['Seedr'],
      summary: 'File playback (direct CDN URL; HLS if Seedr supports it)',
      description:
        'Seedr `/rest/file/{id}/hls` often returns infra 500. Use `data.playUrl` (usually `directUrl` from fetch_file).',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'folder_file_id' } },
      },
    },
  }, async (req) =>
    successResponse(await seedr.getFile(req.params.id), 'Seedr file playback fetched'),
  );

  app.post('/seedr/delete', {
    schema: {
      tags: ['Seedr'],
      summary: 'Delete file / folder / torrent',
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'id'],
              properties: {
                type: { type: 'string', enum: ['file', 'folder', 'torrent'] },
                id: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (req) => {
    const body = deleteBodySchema.parse(req.body);
    const result = await seedr.deleteItems(body.items);
    return successResponse(result, 'Seedr items deleted');
  });

  app.post('/seedr/clear-space', {
    schema: {
      tags: ['Seedr'],
      summary: 'Clear loading torrents + folders + root files',
    },
  }, async () => successResponse(await seedr.clearSpace(), 'Seedr space cleared'));
}
