import assert from 'node:assert/strict';
import {
  parseTitleYear,
  pickBestMatch,
  type TmdbSearchItem,
} from '../src/infrastructure/tmdb/tmdb.service.js';

const parsed = parseTitleYear('salaar 2023');
assert.equal(parsed.title, 'salaar');
assert.equal(parsed.year, 2023);
assert.deepEqual(parseTitleYear('Dune'), { title: 'Dune' });

const items: TmdbSearchItem[] = [
  {
    id: 1,
    mediaType: 'movie',
    title: 'Salaar: Part 1 – Ceasefire',
    year: 2023,
    posterUrl: null,
    overview: null,
    backdropUrl: null,
    voteAverage: 7,
    originalLanguage: 'te',
    popularity: 50,
    genreIds: [],
  },
  {
    id: 2,
    mediaType: 'movie',
    title: 'Other',
    year: 2023,
    posterUrl: null,
    overview: null,
    backdropUrl: null,
    voteAverage: 5,
    originalLanguage: 'en',
    popularity: 99,
    genreIds: [],
  },
];

const match = pickBestMatch(items, 'Salaar', 2023);
assert.equal(match?.id, 1);
assert.equal(pickBestMatch([], 'Salaar', 2023), null);

console.log('check-tmdb-resolve: ok');
