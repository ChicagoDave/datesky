/**
 * Generates a fresh ES256 keypair for AT Protocol OAuth and writes the
 * public half to `public/jwks.json` (committable), printing only the
 * private half to stdout so the operator can capture it into the
 * production `OAUTH_PRIVATE_KEY` env var.
 *
 * Run once: `npx tsx scripts/generate-keys.ts > /tmp/nomare-private-key.json`
 *
 * Owner: Identity/Auth bounded context. Coupled to `oauth-client.ts` via
 * the `kid` constant — keep them in sync.
 */
import * as jose from "jose";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const KID = "nomare-key-1";

async function main() {
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", {
    extractable: true,
  });

  const privateJwk = await jose.exportJWK(privateKey);
  privateJwk.kid = KID;

  const publicJwk = await jose.exportJWK(publicKey);
  publicJwk.kid = KID;

  // Public half: write directly to the served document so this is committable.
  const jwksPath = join(process.cwd(), "public", "jwks.json");
  writeFileSync(
    jwksPath,
    JSON.stringify({ keys: [publicJwk] }, null, 2) + "\n",
    "utf8"
  );

  // Private half: stdout only. Capture via redirect, then set as
  // OAUTH_PRIVATE_KEY in the production env. Never commit this value.
  process.stdout.write(JSON.stringify(privateJwk) + "\n");

  console.error(`[generate-keys] Wrote public JWK to ${jwksPath}`);
  console.error(`[generate-keys] Private JWK written to stdout (kid=${KID})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
