import assert from 'node:assert/strict';
import { resolveMovieLanguage } from '../src/shared/movies/filters.js';

assert.equal(
  resolveMovieLanguage(null, 'Chennai Love Story (2026) DVDScr [Telugu]'),
  'Telugu',
);
assert.equal(
  resolveMovieLanguage(null, 'Supergirl (2026) HDRip [Telugu Dubbed]'),
  'Telugu Dubbed',
);
assert.equal(
  resolveMovieLanguage(null, 'Triple Decker (2026) HDRip [Malayalam]'),
  'Malayalam',
);
assert.equal(
  resolveMovieLanguage(null, 'Shark Warning (2024) BRRip [Tamil Dubbed]'),
  'Tamil Dubbed',
);
assert.equal(resolveMovieLanguage('Hindi', 'Something [Telugu]'), 'Hindi');
assert.equal(resolveMovieLanguage(null, 'No language here'), null);

console.log('check-language: ok');
