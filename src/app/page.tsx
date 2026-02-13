import Link from "next/link";
import LoginButton from "@/components/LoginButton";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          Date<span className="text-sky-400">Sky</span>
        </h1>

        <p className="text-xl sm:text-2xl text-sky-200 leading-relaxed">
          Open dating on Bluesky. Make a profile. Tag yourself. Find each other.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 text-left text-sm text-sky-300">
          <div className="bg-sky-900/50 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-1">Your identity</h3>
            <p>Tied to your Bluesky handle. No burner accounts, no catfishing.</p>
          </div>
          <div className="bg-sky-900/50 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-1">Your data</h3>
            <p>Stored in your Personal Data Server. You control it, you delete it.</p>
          </div>
          <div className="bg-sky-900/50 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-1">No algorithm</h3>
            <p>Find people through tags, lists, and the social graph you already have.</p>
          </div>
          <div className="bg-sky-900/50 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-1">No walled garden</h3>
            <p>See someone interesting? DM them on Bluesky. No matching gate required.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <LoginButton />
          <Link
            href="/browse"
            className="text-sky-400 hover:text-white text-sm transition-colors"
          >
            Browse profiles
          </Link>
        </div>

        <p className="text-sky-500 text-xs">
          Built on{" "}
          <a
            href="https://atproto.com"
            className="underline hover:text-sky-300 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            AT Protocol
          </a>
        </p>
      </div>
    </main>
  );
}
