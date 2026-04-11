import type { APIRoute } from 'astro';
import { clearSessionCookieHeader } from '@/lib/auth';

export const POST: APIRoute = () => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': clearSessionCookieHeader(),
    },
  });
};
