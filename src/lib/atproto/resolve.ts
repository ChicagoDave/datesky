/**
 * Resolve a DID to its PDS host and fetch its profile record.
 *
 * Public interface: `resolveDid(did)` returns `{ pdsHost, handle? }` or `null`;
 * `fetchProfileFromPds(did, pdsHost)` returns a `NomareProfile` or `null`, trying the
 * canonical NSID first and falling back to the legacy NSID per ADR-0003.
 * Owner context: AT Protocol integration — Identity / Profile bounded context.
 */
import {
  COLLECTION,
  LEGACY_COLLECTION,
  RKEY,
  type NomareProfile,
} from "./lexicon";

interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

export async function resolveDid(did: string): Promise<{
  pdsHost: string;
  handle?: string;
} | null> {
  try {
    let doc: DidDocument;

    if (did.startsWith("did:plc:")) {
      const res = await fetch(`https://plc.directory/${did}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) return null;
      doc = await res.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "");
      const res = await fetch(`https://${domain}/.well-known/did.json`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) return null;
      doc = await res.json();
    } else {
      return null;
    }

    const pdsService = doc.service?.find(
      (s) => s.id === "#atproto_pds" && s.type === "AtprotoPersonalDataServer"
    );
    if (!pdsService) return null;

    const pdsHost = new URL(pdsService.serviceEndpoint).hostname;
    const handle = doc.alsoKnownAs
      ?.find((aka) => aka.startsWith("at://"))
      ?.replace("at://", "");

    return { pdsHost, handle };
  } catch {
    return null;
  }
}

/**
 * Try fetching the record at a single NSID. Returns null if the record does not exist
 * (HTTP 4xx) or if the request fails for any reason. Callers compose this with the
 * dual-namespace fallback in `fetchProfileFromPds`.
 */
async function fetchRecordAtCollection(
  did: string,
  pdsHost: string,
  collection: string
): Promise<NomareProfile | null> {
  try {
    const url = `https://${pdsHost}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${collection}&rkey=${RKEY}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.value as NomareProfile;
  } catch {
    return null;
  }
}

/**
 * Fetch a user's profile from their PDS, trying the canonical NSID first and falling
 * back to the legacy NSID per ADR-0003. Returns `null` if neither namespace yields a
 * record (or if the PDS is unreachable).
 */
export async function fetchProfileFromPds(
  did: string,
  pdsHost: string
): Promise<NomareProfile | null> {
  const primary = await fetchRecordAtCollection(did, pdsHost, COLLECTION);
  if (primary) return primary;
  return fetchRecordAtCollection(did, pdsHost, LEGACY_COLLECTION);
}
