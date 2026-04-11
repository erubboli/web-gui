/**
 * GET /api/chain-tip
 *
 * Fetches the current chain tip from the Mintlayer public API.
 * Selects the mainnet or testnet endpoint based on the NETWORK env var.
 * Proxying server-side avoids CORS issues in the browser.
 */

import type { APIRoute } from 'astro';

const TIP_URLS: Record<string, string> = {
  mainnet: 'https://api-server.mintlayer.org/api/v2/chain/tip',
  testnet: 'https://api-server-lovelace.mintlayer.org/api/v2/chain/tip',
};

export const GET: APIRoute = async () => {
  const network = (process.env.NETWORK ?? 'mainnet').toLowerCase();
  const url = TIP_URLS[network] ?? TIP_URLS['mainnet'];

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Chain API returned ${res.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const data = await res.json() as { block_height: number; block_id: string };
    return new Response(JSON.stringify({ height: data.block_height, id: data.block_id }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
