import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Reusable MSW request handlers for component tests.
 * Individual tests can override handlers via server.use(http.post(...)) per-test.
 */
export const handlers = [
  // Default: all /api/rpc calls succeed with empty result
  http.post('/api/rpc', () =>
    HttpResponse.json({ ok: true, result: null }),
  ),

  // Default chain-tip response
  http.get('/api/chain-tip', () =>
    HttpResponse.json({ height: 1000, id: 'abc123' }),
  ),

  // Default indexer-status response
  http.get('/api/indexer-status', () =>
    HttpResponse.json({ up: true, height: 990 }),
  ),
];

export const server = setupServer(...handlers);
