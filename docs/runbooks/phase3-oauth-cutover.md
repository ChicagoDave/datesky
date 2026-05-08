# Phase 3 — OAuth Client Re-registration: Operator Runbook

**Scope:** cuts the OAuth client identity from `https://datesky.app/client-metadata.json` to `https://nomare.net/client-metadata.json`, rotates the ES256 keypair (`datesky-key-1` → `nomare-key-1`), and renames the session cookie (`datesky_session` → `nomare_session`).

**Cutover style:** hard (Decision B in `docs/context/plan.md`). Every existing user session is invalidated by the cookie rename and the new `client_id`; users must re-authorize with their Bluesky account on first visit after deploy.

This phase produces code only. Deployment and the live OAuth flow test happen during/after Phase 4 (vhost + TLS for `nomare.net`).

---

## Pre-deploy checklist

Run on the operator's workstation, before bringing `nomare.net` live in Phase 4.

### 1. Capture the rotated private key

The Phase 3 commit ships a fresh `public/jwks.json` (new x/y under `kid: nomare-key-1`). The matching **private** JWK was generated alongside and written to `/tmp/nomare-private-key.json` during the session that produced this commit. It is **not** in the repository.

```sh
cat /tmp/nomare-private-key.json
```

The output is a single JSON object: the ES256 private JWK with `kid: nomare-key-1`.

### 2. Set the production env

On the VPS (or wherever `OAUTH_PRIVATE_KEY` is set for production):

```sh
# Replace the entire OAUTH_PRIVATE_KEY value with the JSON from step 1.
# Example shape (do not use these values — use the contents of /tmp/nomare-private-key.json):
#   OAUTH_PRIVATE_KEY={"kty":"EC","crv":"P-256","x":"...","y":"...","d":"...","kid":"nomare-key-1"}
```

Also confirm `PUBLIC_URL=https://nomare.net` is set in production env.

### 3. Verify public/private match

`public/jwks.json` (committed) and the private JWK in env must share the same `x` and `y` coordinates and the same `kid`. Mismatch means OAuth signatures will not validate.

```sh
# x/y in public/jwks.json should equal x/y in the private JWK.
jq -r '.keys[0] | {kid, x, y}' public/jwks.json
jq -r '. | {kid, x, y}' /tmp/nomare-private-key.json
```

### 4. Destroy the temp file

```sh
shred -u /tmp/nomare-private-key.json   # or: rm -P /tmp/nomare-private-key.json on macOS
```

### 5. Pre-deploy comms

Send a brief notice (release note / pinned post): "On <date> we move to nomare.net. Your next visit will ask you to log in again with your Bluesky account — once. Your records are unchanged." This is the public face of the hard cutover.

---

## Real-path test (post Phase 4 deploy)

Per CLAUDE.md rule 12a — the real-path test exercises the production OAuth stack (live AT Protocol PDS, real client metadata document, real ES256 signature). It cannot be automated end-to-end because the consent step requires human interaction with the user's PDS, so this is an operator-driven verification.

**Pre-conditions:** Phase 4 is deployed. `https://nomare.net` serves over TLS. `https://nomare.net/client-metadata.json` and `https://nomare.net/jwks.json` are both reachable.

### Steps

1. **Public document reachability**

   ```sh
   curl -fsS https://nomare.net/client-metadata.json | jq .
   curl -fsS https://nomare.net/jwks.json | jq .
   ```

   Expected: `client_id` is `https://nomare.net/client-metadata.json`; `jwks.json` `kid` is `nomare-key-1`; the JWKS `x`/`y` match the public half of the rotated keypair.

2. **Login flow**

   In a browser without an existing nomare session cookie:

   1. Visit `https://nomare.net/`
   2. Initiate login with a real Bluesky handle (a test handle is fine; production handles also work — login does not modify their PDS)
   3. Complete the Bluesky consent screen
   4. Land back at `https://nomare.net/auth/callback?...`
   5. Verify the callback redirects to a logged-in state (profile or home page rendering the authenticated user's handle)

3. **Session cookie shape**

   In the browser dev tools after step 2.5: a cookie named `nomare_session` is set on `nomare.net`, `HttpOnly`, `Secure`, `SameSite=Lax`. No `datesky_session` cookie is present.

4. **Refresh persistence**

   Hard-refresh the page. The session persists (no re-login prompt). Confirms the `oauth_sessions` SQLite store is being read on subsequent requests.

5. **Profile read still works**

   Navigate to your own profile. The page renders without errors. Confirms the OAuth-bound atproto agent can still read the canonical (`app.nomare.profile`) record via the dual-publish read path established in Phase 2.

### Expected failure modes (and what they mean)

- **`invalid_client` from Bluesky:** the AT Protocol OAuth server cannot fetch `https://nomare.net/client-metadata.json`. Check Phase 4 vhost / TLS. The document must be served with `Content-Type: application/json` and a valid TLS chain.
- **`invalid_dpop_proof` or signature errors:** `OAUTH_PRIVATE_KEY` in env does not match `public/jwks.json` `x`/`y`. Re-run pre-deploy step 3.
- **Callback lands but session is empty:** check the SQLite `oauth_sessions` table is being written. If empty after callback, the `sessionStore.set` callback in `oauth-client.ts` is not running — likely a DB write failure.

### Sign-off

When steps 1–5 all pass, Phase 3 is observed-stable. Update `docs/context/plan.md` with the test date and any observations.

---

## Rollback

If the cutover misbehaves before users notice:

1. Revert the Phase 3 commit (`git revert <sha>`) and redeploy. The old `client_id` (`datesky.app`) and the old `kid` (`datesky-key-1`) come back.
2. Restore the prior `OAUTH_PRIVATE_KEY` env value (the operator must have retained it for this purpose).
3. Phase 4's `nomare.net` vhost can stay live; only `client-metadata.json` reverts.

If users have already started re-authenticating against `nomare.net`, rollback drops their newly-minted nomare sessions — they will need to re-authenticate again against the restored `datesky.app` client. Acceptable as a one-time emergency cost; not a planned sequence.
