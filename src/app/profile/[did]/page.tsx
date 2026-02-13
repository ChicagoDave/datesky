import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveDid, fetchProfileFromPds } from "@/lib/atproto/resolve";
import ProfileView from "@/components/ProfileView";

interface Props {
  params: Promise<{ did: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { did } = await params;
  const decodedDid = decodeURIComponent(did);
  const resolved = await resolveDid(decodedDid);
  if (!resolved) return { title: "Profile Not Found — DateSky" };

  const profile = await fetchProfileFromPds(decodedDid, resolved.pdsHost);
  if (!profile) return { title: "Profile Not Found — DateSky" };

  const name = profile.displayName || resolved.handle || decodedDid;
  const description = profile.bio
    ? profile.bio.slice(0, 160)
    : `${name} on DateSky`;

  return {
    title: `${name} — DateSky`,
    description,
    openGraph: {
      title: `${name} — DateSky`,
      description,
      type: "profile",
      siteName: "DateSky",
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

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <ProfileView
        profile={profile}
        did={decodedDid}
        handle={resolved.handle}
        pdsHost={resolved.pdsHost}
      />
    </main>
  );
}
