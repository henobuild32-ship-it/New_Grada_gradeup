import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicApi } from '../../src/lib/api/public-routes.ts';

test('only the read-only code-verification routes are public before sign-in', () => {
  assert.equal(isPublicApi('/api/join/verify-school-code'), true);
  assert.equal(isPublicApi('/api/parent-link/validate'), true);
  assert.equal(isPublicApi('/api/parent-link'), false);
  assert.equal(isPublicApi('/api/join/verify-school-code/admin'), false);
});
