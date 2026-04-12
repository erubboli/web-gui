import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/indexer', () => ({
  getIndexerChainTip: vi.fn(),
}));

vi.mock('@/lib/wallet-rpc', () => ({
  nodeBestBlockHeight: vi.fn(),
  rpcCall: vi.fn(),
  WalletRpcError: class WalletRpcError extends Error {
    code: number;
    constructor(msg: string, code: number) { super(msg); this.code = code; }
  },
}));

import { GET } from '@/pages/api/indexer-status';
import { getIndexerChainTip } from '@/lib/indexer';
import { nodeBestBlockHeight } from '@/lib/wallet-rpc';

function makeCtx() {
  return { request: new Request('http://localhost/api/indexer-status') } as Parameters<typeof GET>[0];
}

describe('GET /api/indexer-status', () => {
  beforeEach(() => {
    vi.mocked(nodeBestBlockHeight).mockResolvedValue(1000);
  });

  it('returns {up: true, height, synced} when indexer is reachable and near node', async () => {
    vi.mocked(getIndexerChainTip).mockResolvedValueOnce(999);
    const res = await GET(makeCtx());
    const body = await res.json() as Record<string, unknown>;
    expect(body.up).toBe(true);
    expect(body.height).toBe(999);
    expect(body.synced).toBe(true);
  });

  it('returns {up: false} when indexer returns null (unreachable)', async () => {
    vi.mocked(getIndexerChainTip).mockResolvedValueOnce(null);
    const res = await GET(makeCtx());
    const body = await res.json() as Record<string, unknown>;
    expect(body.up).toBe(false);
  });

  it('returns synced=false when indexer is more than 2 blocks behind', async () => {
    vi.mocked(getIndexerChainTip).mockResolvedValueOnce(990); // 10 behind
    const res = await GET(makeCtx());
    const body = await res.json() as Record<string, unknown>;
    expect(body.up).toBe(true);
    expect(body.synced).toBe(false);
  });

  it('includes nodeHeight in the response', async () => {
    vi.mocked(getIndexerChainTip).mockResolvedValueOnce(1000);
    const res = await GET(makeCtx());
    const body = await res.json() as Record<string, unknown>;
    expect(body.nodeHeight).toBe(1000);
  });

  it('still returns a response when nodeBestBlockHeight throws', async () => {
    vi.mocked(getIndexerChainTip).mockResolvedValueOnce(1000);
    vi.mocked(nodeBestBlockHeight).mockRejectedValueOnce(new Error('daemon down'));
    const res = await GET(makeCtx());
    const body = await res.json() as Record<string, unknown>;
    expect(body.nodeHeight).toBeNull();
  });

  it('returns Content-Type: application/json', async () => {
    vi.mocked(getIndexerChainTip).mockResolvedValueOnce(1000);
    const res = await GET(makeCtx());
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});
