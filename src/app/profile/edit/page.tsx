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
        Edit Your{" "}
        <span className="bg-gradient-to-r from-[#d60270] via-[#9b4f96] to-[#0038a8] bg-clip-text text-transparent">
          Nomare
        </span>{" "}
        Profile
      </h1>
      <ProfileForm />
    </main>
  );
}
