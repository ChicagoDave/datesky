import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — DateSky",
  description:
    "How DateSky works: open dating on the AT Protocol network, your data in your own repo. Independent project, not affiliated with Bluesky Social PBC.",
};

export default function About() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] px-6 py-16">
      <article className="max-w-3xl mx-auto space-y-12">
        <header className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            How{" "}
            <span className="bg-gradient-to-r from-[#d60270] via-[#9b4f96] to-[#0038a8] bg-clip-text text-transparent">
              DateSky
            </span>{" "}
            works
          </h1>
          <p className="text-sky-300">A field guide to open-network dating.</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Why DateSky exists</h2>
          <blockquote className="border-l-4 border-[#d60270] pl-6 py-2 text-lg text-sky-100 italic leading-relaxed">
            I created DateSky because current dating apps make billions of
            dollars walling people off from each other and gamifying
            connections. It&apos;s scary to put yourself out there on a public
            dating site, but it&apos;s how you build a community and truly find
            your people. Don&apos;t be shy. Join us.
          </blockquote>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Where your data lives</h2>
          <p className="text-sky-200 leading-relaxed">
            Your profile is a record in <em>your</em> Bluesky repo. Not on a
            DateSky server.
          </p>
          <ul className="space-y-3 text-sky-200">
            <li className="flex gap-3">
              <span className="text-[#d60270] flex-shrink-0">·</span>
              <span>
                Profile fields live at{" "}
                <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">
                  app.datesky.profile
                </code>{" "}
                in your AT Protocol repo.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#d60270] flex-shrink-0">·</span>
              <span>
                Photos are blobs in your PDS — DateSky never stores image bytes.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#d60270] flex-shrink-0">·</span>
              <span>
                Delete your profile from DateSky and the record disappears from
                your repo and from everyone who indexes it.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#d60270] flex-shrink-0">·</span>
              <span>
                Sign in with Bluesky, Blacksky, or any AT Protocol PDS.
              </span>
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">How moderation works</h2>
          <p className="text-sky-200 leading-relaxed">
            DateSky inherits the open AT Protocol moderation floor:
          </p>
          <ul className="space-y-3 text-sky-200">
            <li className="flex gap-3">
              <span className="text-[#9b4f96] flex-shrink-0">·</span>
              <span>
                Account suspended on Bluesky → can&apos;t sign in to DateSky.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#9b4f96] flex-shrink-0">·</span>
              <span>
                Photo taken down on Bluesky → photo disappears from DateSky
                automatically.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#9b4f96] flex-shrink-0">·</span>
              <span>Illegal content is handled by the hosting PDS, not us.</span>
            </li>
          </ul>
          <p className="text-sky-200 leading-relaxed">
            Beyond that floor, DateSky will add its own community standards over
            time. When we do, we&apos;ll say what they are.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Why public is the point</h2>
          <ul className="space-y-3 text-sky-200">
            <li className="flex gap-3">
              <span className="text-[#0038a8] flex-shrink-0">·</span>
              <span>
                <strong className="text-white">Real handles.</strong> No burner
                accounts, no catfishing.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#0038a8] flex-shrink-0">·</span>
              <span>
                <strong className="text-white">No matching gate.</strong> See
                someone interesting? DM them on Bluesky directly.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#0038a8] flex-shrink-0">·</span>
              <span>
                <strong className="text-white">No algorithm.</strong> Find
                people through tags and the social graph you already have.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[#0038a8] flex-shrink-0">·</span>
              <span>
                <strong className="text-white">Your data, your control.</strong>{" "}
                Walk away whenever; you keep your repo.
              </span>
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">A note on safety</h2>
          <p className="text-sky-200 leading-relaxed">
            Putting a dating profile on the public web is a real choice with
            real implications. Don&apos;t share what you&apos;d be uncomfortable
            seeing on a billboard. We&apos;re working on tools to give you more
            control over how you experience the network — match mode to filter
            who you see, settings to hide photos, and a compact view that strips
            images entirely. But the open web is the floor, and we won&apos;t
            pretend otherwise.
          </p>
        </section>

        <section className="space-y-4 pt-8 border-t border-white/10">
          <h2 className="text-xl font-semibold">Independent and open source</h2>
          <p className="text-sky-300 text-sm leading-relaxed">
            The code is on GitHub at{" "}
            <a
              href="https://github.com/chicagodave/datesky"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              github.com/chicagodave/datesky
            </a>
            . Issues, pull requests, and feedback are welcome.
          </p>
          <p className="text-sky-300 text-sm leading-relaxed">
            The name &ldquo;DateSky&rdquo; is a working title — we&apos;re open
            to a better one. If you have a suggestion, please open a{" "}
            <a
              href="https://github.com/chicagodave/datesky/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              GitHub issue
            </a>
            .
          </p>
          <p className="text-sky-300 text-sm leading-relaxed">
            DateSky is not affiliated with, endorsed by, or sponsored by
            Bluesky Social PBC. Built on the open{" "}
            <a
              href="https://atproto.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              AT Protocol
            </a>{" "}
            network.
          </p>
        </section>
      </article>
    </main>
  );
}
