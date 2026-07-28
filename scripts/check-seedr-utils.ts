import assert from 'node:assert/strict';
import {
  formatSeedrTorrentTimeLeft,
  parseSeedrTorrentProgress,
  seedrTorrentDisplayName,
} from '../src/shared/seedr/torrent-utils.js';

assert.equal(parseSeedrTorrentProgress('42%'), 42);
assert.equal(parseSeedrTorrentProgress(0.5), 50);
assert.equal(parseSeedrTorrentProgress(75), 75);
assert.equal(seedrTorrentDisplayName('  Foo  '), 'Foo');

const eta = formatSeedrTorrentTimeLeft(1000, 50, 100);
assert.equal(eta.etaSeconds, 5);
assert.ok(eta.etaLabel);

console.log('check-seedr-utils: ok');
