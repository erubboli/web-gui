import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/pages/api/chain-tip';

const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  delete process.env.NETWORK;
});

afterEach(() => {
  mockFetch.mockReset();
  vi.unstubAllGlobals();
  delete process.env.NETWORK;
});

function makeCtx() {
  return { request: new Request('http://localhost/api/chain-tip') } as Parameters<typeof GET>[0];
}

function upstreamOk(blockHeight: number, blockId: string) {
  return new Response(JSON.stringify({ block_height: blockHeight, block_id: blockId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/chain-tip', () => {
  it('returns {height, id} on upstream success', async () => {
    mockFetch.mockResolvedValueOnce(upstreamOk(12345, 'abc'));
    const res = await GET(makeCtx());
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body).toEqual({ height: 12345, id: 'abc' });
  });

  it('uses the mainnet endpoint when NETWORK is unset', async () => {
    mockFetch.mockResolvedValueOnce(upstreamOk(1, 'x'));
    await GET(makeCtx());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('api-server.mintlayer.org');
  });

  it('uses the mainnet endpoint when NETWORK=mainnet', async () => {
    process.env.NETWORK = 'mainnet';
    mockFetch.mockResolvedValueOnce(upstreamOk(1, 'x'));
    await GET(makeCtx());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('api-server.mintlayer.org');
    expect(url).not.toContain('lovelace');
  });

  it('uses the testnet endpoint when NETWORK=testnet', async () => {
    process.env.NETWORK = 'testnet';
    mockFetch.mockResolvedValueOnce(upstreamOk(1, 'x'));
    await GET(makeCtx());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('lovelace');
  });

  it('returns 502 when upstream returns non-ok status', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 503 }));
    const res = await GET(makeCtx());
    expect(res.status).toBe(502);
  });

  it('returns 502 when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    const res = await GET(makeCtx());
    expect(res.status).toBe(502);
  });

  it('sets Cache-Control: no-cache on success', async () => {
    mockFetch.mockResolvedValueOnce(upstreamOk(1, 'x'));
    const res = await GET(makeCtx());
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('returns Content-Type: application/json on error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 503 }));
    const res = await GET(makeCtx());
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});
