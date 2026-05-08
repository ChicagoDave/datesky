import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveDid, fetchProfileFromPds } from "@/lib/atproto/resolve";
import ProfileView from "@/components/ProfileView";
import { getSession } from "@/lib/session";
import { getUserPreferences } from "@/lib/db/queries";

interface Props {
  params: Promise<{ did: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { did } = await params;
  const decodedDid = decodeURIComponent(did);
  const resolved = await resolveDid(decodedDid);
  if (!resolved) return { title: "Profile Not Found — Nomare" };

  const profile = await fetchProfileFromPds(decodedDid, resolved.pdsHost);
  if (!profile) return { title: "Profile Not Found — Nomare" };

  const name = profile.displayName || resolved.handle || decodedDid;
  const description = profile.bio
    ? profile.bio.slice(0, 160)
    : `${name} on Nomare`;

  return {
    title: `${name} — Nomare`,
    description,
    openGraph: {
      title: `${name} — Nomare`,
      description,
      type: "profile",
      siteName: "Nomare",
    },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { did } = await params;
  const decodedDid = decodeURIComponent(did);

  const resolved = await resolveDid(decodedDid);
  if (!resolved) {
    notFound();
  }

  const profile = await fetchProfileFromPds(decodedDid, resolved.pdsHost);
  if (!profile) {
    notFound();
  }

  const session = await getSession();
  const viewerPrefs = session.did
    ? getUserPreferences(session.did)
    : { show_photos: true, compact_view: false };

  // Strip photos before rendering when the viewer has chosen to hide them.
  // ADR 0001: enforcement happens server-side so photos never reach the browser.
  const renderedProfile = viewerPrefs.show_photos
    ? profile
    : { ...profile, photos: [] };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <ProfileView
        profile={renderedProfile}
        did={decodedDid}
        handle={resolved.handle}
        pdsHost={resolved.pdsHost}
        photosHidden={!viewerPrefs.show_photos}
      />
    </main>
  );
}
