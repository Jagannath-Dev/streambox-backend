#!/usr/bin/env node
/**
 * Build & push API image for Hostinger (pull-only deploy).
 *
 * Usage:
 *   DOCKER_IMAGE=youruser/streambox-backend:latest pnpm docker:publish
 *   # or set DOCKER_IMAGE in .env
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function loadDotEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

const image = process.env.DOCKER_IMAGE?.trim();
if (!image || image.includes('youruser') || image.includes('yourdockerhub')) {
  console.error(`
Set DOCKER_IMAGE to your Docker Hub (or GHCR) image, then re-run.

  Example:
    DOCKER_IMAGE=jagannath/streambox-backend:latest pnpm docker:publish

  Or add to .env:
    DOCKER_IMAGE=jagannath/streambox-backend:latest

Then on Hostinger, use the same DOCKER_IMAGE and deploy docker-compose.yml
`);
  process.exit(1);
}

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('docker', ['build', '-t', image, '.']);
run('docker', ['push', image]);
console.log(`\nPushed ${image}`);
console.log('On Hostinger: set DOCKER_IMAGE to that value, redeploy docker-compose.yml\n');
