import { describe, it, expect } from 'vitest';
import { POST } from '@/pages/api/logout';

describe('POST /api/logout', () => {
  it('returns 302 redirect to /login', async () => {
    const req = new Request('http://localhost/api/logout', { method: 'POST' });
    const res = await POST({ request: req } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/login');
  });

  it('clears the session cookie with Max-Age=0', async () => {
    const req = new Request('http://localhost/api/logout', { method: 'POST' });
    const res = await POST({ request: req } as Parameters<typeof POST>[0]);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('session=');
  });

  it('sets HttpOnly and SameSite=Strict on the cleared cookie', async () => {
    const req = new Request('http://localhost/api/logout', { method: 'POST' });
    const res = await POST({ request: req } as Parameters<typeof POST>[0]);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });
});
