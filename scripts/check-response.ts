import assert from 'node:assert/strict';
import { AppError } from '../src/shared/errors/app-error.js';
import { failedResponse, successResponse } from '../src/shared/http/api-response.js';

const ok = successResponse({ id: 1 }, 'done', { count: 1 });
assert.equal(ok.success, true);
assert.equal(ok.message, 'done');
assert.deepEqual(ok.data, { id: 1 });
assert.deepEqual(ok.meta, { count: 1 });

const fail = failedResponse('nope', 'NOT_FOUND', { id: 'x' });
assert.equal(fail.success, false);
assert.equal(fail.error.code, 'NOT_FOUND');

const err = AppError.notFound('missing');
assert.equal(err.statusCode, 404);
assert.equal(err.code, 'NOT_FOUND');

console.log('check-response: ok');
