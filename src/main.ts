import dns from 'node:dns';
import { buildApp } from './app.js';
import { loadEnv } from './shared/config/env.js';
import { loadDotEnv } from './shared/config/load-dotenv.js';

// Prefer IPv4 — intermittent ENOTFOUND / dual-stack flakes to api.themoviedb.org
dns.setDefaultResultOrder('ipv4first');

async function main() {
  loadDotEnv();
  const env = loadEnv();
  const app = await buildApp(env);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    const localDocs = `http://localhost:${env.PORT}/docs`;
    const serverDocs = env.PUBLIC_URL ? `${env.PUBLIC_URL}/docs` : null;
    app.log.info(`Streambox API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
    app.log.info(`Docs (localhost): ${localDocs}`);
    app.log.info(`Docs (server):    ${serverDocs ?? '(set PUBLIC_URL in .env)'}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
