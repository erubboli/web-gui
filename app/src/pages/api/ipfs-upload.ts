/**
 * /api/ipfs-upload — Server-side proxy to Pinata IPFS pinning service.
 *
 * Requires PINATA_JWT environment variable to be set.
 * Returns 503 if IPFS upload is not configured.
 */

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return json({ ok: false, error: { message: 'IPFS upload not configured (PINATA_JWT not set)' } }, 503);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, error: { message: 'Invalid multipart form data' } }, 400);
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return json({ ok: false, error: { message: 'Missing file field' } }, 400);
  }

  // Forward to Pinata v3 API
  const pinataForm = new FormData();
  pinataForm.append('file', file, file.name);
  pinataForm.append('name', file.name);

  let pinataRes: Response;
  try {
    pinataRes = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: pinataForm,
    });
  } catch (err) {
    return json({ ok: false, error: { message: `Pinata unreachable: ${String(err)}` } }, 502);
  }

  let rawBody: string;
  try {
    rawBody = await pinataRes.text();
  } catch (err) {
    return json({ ok: false, error: { message: `Failed to read Pinata response: ${String(err)}` } }, 502);
  }

  console.log(`[ipfs-upload] Pinata status=${pinataRes.status} body=${rawBody}`);

  let data: { data?: { cid: string }; error?: string };
  try {
    data = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: { message: `Pinata returned non-JSON (status ${pinataRes.status}): ${rawBody.slice(0, 200)}` } }, 502);
  }

  if (!pinataRes.ok) {
    const msg = data.error ?? `Pinata error ${pinataRes.status}`;
    return json({ ok: false, error: { message: msg } }, 502);
  }

  const cid = data.data?.cid;
  if (!cid) {
    return json({ ok: false, error: { message: `Pinata returned no CID — full response: ${rawBody.slice(0, 500)}` } }, 502);
  }
  return json({ ok: true, cid, url: `ipfs://${cid}` }, 200);
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
