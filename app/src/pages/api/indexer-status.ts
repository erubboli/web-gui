import type { APIRoute } from 'astro';
import { getIndexerChainTip } from '@/lib/indexer';
import { nodeBestBlockHeight } from '@/lib/wallet-rpc';

export const GET: APIRoute = async () => {
  const [height, nodeHeight] = await Promise.all([
    getIndexerChainTip(),
    nodeBestBlockHeight().catch(() => null),
  ]);
  const up = height !== null;
  const synced = up && nodeHeight !== null && height >= nodeHeight - 2;
  return new Response(JSON.stringify({ up, height, nodeHeight, synced }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
