/**
 * Global site footer.
 *
 * Public interface: default export rendered once in RootLayout.
 * Owner context: layout chrome.
 *
 * Carries the affiliation disclaimer and the AT Protocol attribution.
 * Required for trademark hygiene — Nomare is independent of Bluesky Social PBC.
 */
export default function Footer() {
  return (
    <footer className="border-t border-white/10 mt-16 py-6 px-4">
      <div className="max-w-5xl mx-auto text-center text-xs text-white/50 space-y-1.5">
        <p>
          Nomare is an independent project. Not affiliated with, endorsed by,
          or sponsored by Bluesky Social PBC.
        </p>
        <p>
          Built on the open{" "}
          <a
            href="https://atproto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/80"
          >
            AT Protocol
          </a>
          {" "}network. Works with any AT Protocol PDS.
        </p>
      </div>
    </footer>
  );
}
