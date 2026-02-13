// TypeScript types derived from lexicons/app/datesky/profile.json

export const COLLECTION = "app.datesky.profile" as const;
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

export interface DateSkyProfile {
  $type?: typeof COLLECTION;
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
