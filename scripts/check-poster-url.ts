import assert from 'node:assert/strict';
import { normalizeMovierulzUrl } from '../src/shared/movies/poster-url.js';

const mirror = 'https://www.5movierulz.vote/';

assert.equal(
  normalizeMovierulzUrl(
    'https://www.5movierulz.soccer/wp-content/uploads/poster.jpg',
    mirror,
  ),
  'https://www.5movierulz.vote/wp-content/uploads/poster.jpg',
);
assert.equal(
  normalizeMovierulzUrl(
    'https://www.5movierulz.discount/wp-content/uploads/a.jpg',
    mirror,
  ),
  'https://www.5movierulz.vote/wp-content/uploads/a.jpg',
);
assert.equal(
  normalizeMovierulzUrl('https://image.tmdb.org/t/p/w185/x.jpg', mirror),
  'https://image.tmdb.org/t/p/w185/x.jpg',
);
assert.equal(normalizeMovierulzUrl(null, mirror), null);

console.log('check-poster-url: ok');
