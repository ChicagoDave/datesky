/**
 * Lexicon constants and TypeScript types for the Nomare profile record.
 *
 * Public interface: `COLLECTION` (canonical NSID), `LEGACY_COLLECTION` (dual-publish mirror),
 * `RKEY`, the `NomareProfile` interface, the `ProfilePhoto` interface, and `KNOWN_INTENTIONS`.
 * Owner context: AT Protocol integration — Identity / Profile bounded context.
 *
 * The schema is byte-for-byte identical between the two NSIDs during the dual-publish
 * transition (ADR-0003). A single `NomareProfile` interface covers both. The schema source
 * of truth is `lexicons/app/nomare/profile.json`; the legacy file is retained as a mirror
 * and must not diverge until the legacy mirror write is sunset.
 */

export const COLLECTION = "app.nomare.profile" as const;
export const LEGACY_COLLECTION = "app.datesky.profile" as const;
export const RKEY = "self" as const;

export interface ProfilePhoto {
  image: {
    $type: "blob";
    ref: { $link: string };
    mimeType: string;
    size: number;
  };
  alt: string;
}

export interface NomareProfile {
  $type?: typeof COLLECTION | typeof LEGACY_COLLECTION;
  displayName?: string;
  bio?: string;
  photos?: ProfilePhoto[];
  intentions?: string[];
  location?: string;
  gender?: string;
  pronouns?: string;
  age?: number;
  tags?: string[];
  createdAt: string;
}

export const KNOWN_INTENTIONS = [
  "dating",
  "friends",
  "casual",
  "long-term",
] as const;
