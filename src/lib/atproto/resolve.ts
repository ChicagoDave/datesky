import { COLLECTION, RKEY, type DateSkyProfile } from "./lexicon";

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

export async function fetchProfileFromPds(
  did: string,
  pdsHost: string
): Promise<DateSkyProfile | null> {
  try {
    const url = `https://${pdsHost}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${COLLECTION}&rkey=${RKEY}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.value as DateSkyProfile;
  } catch {
    return null;
  }
}
