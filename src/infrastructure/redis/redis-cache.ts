import { createClient, type RedisClientType } from 'redis';
import { createHash } from 'node:crypto';
import type { Env } from '../../shared/config/env.js';

export type RedisCache = {
  getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<{ value: T; cache: 'hit' | 'miss' | 'bypass' }>;
  /** Clear all keys in the Redis DB used by this app. */
  flush(): Promise<{ ok: boolean; mode: 'redis' | 'bypass' }>;
  ping(): Promise<string>;
  close(): Promise<void>;
};

function stableKey(prefix: string, payload: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `${prefix}:${hash}`;
}

export function cacheKey(prefix: string, payload: unknown): string {
  return stableKey(prefix, payload);
}

/** No-op cache when Redis is unavailable / not configured. */
export function createMemoryBypassCache(): RedisCache {
  return {
    async getOrSet(_key, _ttl, loader) {
      return { value: await loader(), cache: 'bypass' };
    },
    async flush() {
      return { ok: true, mode: 'bypass' };
    },
    async ping() {
      return 'BYPASS';
    },
    async close() {},
  };
}

export async function createRedisCache(env: Env, log?: { warn: (o: unknown, msg?: string) => void }): Promise<RedisCache> {
  if (!env.REDIS_URL) return createMemoryBypassCache();

  const client: RedisClientType = createClient({ url: env.REDIS_URL });
  client.on('error', (err) => {
    log?.warn({ err }, 'Redis client error');
  });

  try {
    await client.connect();
    await client.ping();
  } catch (err) {
    log?.warn({ err }, 'Redis connect failed — search cache disabled');
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
    return createMemoryBypassCache();
  }

  return {
    async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>) {
      try {
        const hit = await client.get(key);
        if (hit != null) {
          return { value: JSON.parse(hit) as T, cache: 'hit' };
        }
      } catch (err) {
        log?.warn({ err, key }, 'Redis get failed');
      }

      const value = await loader();
      try {
        await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
      } catch (err) {
        log?.warn({ err, key }, 'Redis set failed');
      }
      return { value, cache: 'miss' };
    },
    async flush() {
      await client.flushDb();
      return { ok: true, mode: 'redis' as const };
    },
    async ping() {
      return client.ping();
    },
    async close() {
      if (client.isOpen) await client.quit();
    },
  };
}

export const CACHE_TTL = {
  moviesSearch: 120,
  moviesDetail: 300,
  moviesTorrents: 300,
  tmdbAutocomplete: 120,
  tmdbSearch: 180,
  tmdbDiscover: 180,
  tmdbFilters: 86_400,
  tmdbDetails: 600,
  tmdbResolve: 600,
} as const;
