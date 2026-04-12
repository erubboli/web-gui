import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './msw-handlers';

// Start MSW for all tests that use jsdom (component tests).
// For Node-environment tests the server is also started but has no effect
// since fetch interception works via the same mechanism.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
