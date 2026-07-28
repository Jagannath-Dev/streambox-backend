import assert from 'node:assert/strict';
import { resolveMovieQuality } from '../src/shared/movies/filters.js';

assert.equal(
  resolveMovieQuality('Ceasefire', 'Salaar: Part 1 – Ceasefire (2023) HDRip Telugu Movie'),
  'HDRip',
);
assert.equal(
  resolveMovieQuality('Part', 'Salaar (2023) BRRip Hindi Movie Watch Online Free'),
  'BRRip',
);
assert.equal(resolveMovieQuality('HDRip', 'whatever'), 'HDRip');
assert.equal(resolveMovieQuality('HD', null), 'HD');
assert.equal(resolveMovieQuality(null, 'Movie HDRip Telugu'), 'HDRip');
assert.equal(resolveMovieQuality(null, 'Something DVDScr Tamil'), 'DVDScr');

console.log('check-quality: ok');
