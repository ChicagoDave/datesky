// Run once: npx tsx scripts/generate-keys.ts
// Generates an ES256 keypair for AT Protocol OAuth

import * as jose from "jose";

async function main() {
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", {
    extractable: true,
  });

  const privateJwk = await jose.exportJWK(privateKey);
  privateJwk.kid = "datesky-key-1";

  const publicJwk = await jose.exportJWK(publicKey);
  publicJwk.kid = "datesky-key-1";

  console.log("=== Add to .env (OAUTH_PRIVATE_KEY) ===");
  console.log(JSON.stringify(privateJwk));

  console.log("\n=== Save as public/jwks.json ===");
  console.log(JSON.stringify({ keys: [publicJwk] }, null, 2));
}

main().catch(console.error);
