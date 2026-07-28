/**
 * Mint a valid NextAuth session cookie for LOCAL VERIFICATION ONLY.
 *
 * Lets us load the authenticated dashboard against a local server without
 * touching middleware.ts or weakening the production auth path.
 *
 *   npx tsx scripts/mint-local-session.ts
 *
 * Prints a Cookie header value. Requires NEXTAUTH_SECRET in env.
 */
import { encode } from 'next-auth/jwt';

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error('NEXTAUTH_SECRET not set');
    process.exit(1);
  }

  const token = await encode({
    token: {
      name: 'Local Verify',
      email: 'verify@municibid.com',
      sub: 'local-verify',
    },
    secret,
  });

  console.log(`next-auth.session-token=${token}`);
}

main();
