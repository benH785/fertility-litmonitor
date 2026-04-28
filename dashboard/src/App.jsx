import { Routes, Route, Link, useLocation } from "react-router-dom";
import IndexPage from "./pages/IndexPage.jsx";
import DigestPage from "./pages/DigestPage.jsx";
import { repoIsConfigured, repoUrl } from "./lib/api.js";

export default function App() {
  const location = useLocation();
  const onIndex = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      <Header onIndex={onIndex} />

      {!repoIsConfigured() && <ConfigBanner />}

      <main className="flex-1 px-6 md:px-12 lg:px-20 py-10 md:py-14">
        <Routes>
          <Route path="/" element={<IndexPage />} />
          <Route path="/digest/:filename" element={<DigestPage />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

function Header({ onIndex }) {
  return (
    <header className="px-6 md:px-12 lg:px-20 pt-10 pb-6 hairline border-t-0 border-b">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Link to="/" className="block">
            <p className="smallcaps mb-1">Fertility literature monitor</p>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
              {onIndex ? (
                <>The week's reading.</>
              ) : (
                <>Digest.</>
              )}
            </h1>
          </Link>
        </div>
        {!onIndex && (
          <Link to="/" className="link-underline text-sm">
            ← All digests
          </Link>
        )}
      </div>
    </header>
  );
}

function ConfigBanner() {
  return (
    <div className="bg-ink text-paper px-6 md:px-12 lg:px-20 py-3 text-sm font-mono">
      ⚠ Repo not configured. Set <code className="text-accent-soft">VITE_REPO_OWNER</code> and{" "}
      <code className="text-accent-soft">VITE_REPO_NAME</code> in your Vercel env vars (or{" "}
      <code className="text-accent-soft">.env.local</code> for dev).
    </div>
  );
}

function Footer() {
  const repo = repoUrl();
  return (
    <footer className="px-6 md:px-12 lg:px-20 py-8 hairline mt-12 text-xs text-muted font-mono">
      <div className="flex justify-between gap-4 flex-wrap">
        <span>
          Reads digest data from {repo ? (
            <a className="link-underline" href={repo} target="_blank" rel="noreferrer">
              the repo
            </a>
          ) : (
            "the configured repo"
          )}.
        </span>
        <span>
          Updated weekly via GitHub Actions.
        </span>
      </div>
    </footer>
  );
}
