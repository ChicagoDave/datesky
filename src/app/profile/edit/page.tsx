import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ProfileForm from "@/components/ProfileForm";

export const runtime = "nodejs";

export default async function EditProfilePage() {
  const session = await getSession();
  if (!session.did) {
    redirect("/");
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        Edit Your Date<span className="text-sky-400">Sky</span> Profile
      </h1>
      <ProfileForm />
    </main>
  );
}
