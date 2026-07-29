/**
 * Throwaway local helper for visual verification ONLY.
 *
 * Issues a Set-Cookie for the NextAuth session token (minted from the local
 * NEXTAUTH_SECRET) and redirects to the app. Cookies are shared across ports
 * on localhost, so this authenticates the browser against :3111 without
 * modifying middleware.ts or any production auth path.
 *
 *   npx tsx scripts/local-auth-bridge.ts
 *   then browse http://localhost:3112/?to=/cron
 */
import { createServer } from 'http';
import { encode } from 'next-auth/jwt';

const APP_PORT = process.env.APP_PORT ?? '3111';
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 3112);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${BRIDGE_PORT}`);
  const to = url.searchParams.get('to') ?? '/';

  const token = await encode({
    token: {
      name: 'Local Verify',
      email: 'verify@municibid.com',
      sub: 'local-verify',
    },
    secret: process.env.NEXTAUTH_SECRET!,
  });

  res.writeHead(302, {
    'Set-Cookie': `next-auth.session-token=${token}; Path=/; SameSite=Lax`,
    Location: `http://localhost:${APP_PORT}${to}`,
  });
  res.end();
});

server.listen(BRIDGE_PORT, () => {
  console.log(`auth bridge on http://localhost:${BRIDGE_PORT}/?to=/cron`);
});
