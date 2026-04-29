import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import IndexPage from "./pages/IndexPage.jsx";
import DigestPage from "./pages/DigestPage.jsx";
import BookmarksPage from "./pages/BookmarksPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import { repoIsConfigured, repoUrl, getStarredPmids } from "./lib/api.js";

export default function App() {
  const location = useLocation();
  const onIndex = location.pathname === "/";
  const onBookmarks = location.pathname === "/bookmarks";
  const onSettings = location.pathname === "/settings";

  return (
    <div className="min-h-screen flex flex-col">
      <Header onIndex={onIndex} onBookmarks={onBookmarks} onSettings={onSettings} />

      {!repoIsConfigured() && <ConfigBanner />}

      <main className="flex-1 px-6 md:px-12 lg:px-20 py-10 md:py-14">
        <Routes>
          <Route path="/" element={<IndexPage />} />
          <Route path="/digest/:filename" element={<DigestPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

function Header({ onIndex, onBookmarks, onSettings }) {
  const [starCount, setStarCount] = useState(() => getStarredPmids().size);

  useEffect(() => {
    const update = () => setStarCount(getStarredPmids().size);
    update();
    window.addEventListener("litmon:starred-changed", update);
    return () => window.removeEventListener("litmon:starred-changed", update);
  }, []);

  let title;
  if (onSettings) title = <>Settings.</>;
  else if (onBookmarks) title = <>Bookmarks.</>;
  else if (onIndex) title = <>The week's reading.</>;
  else title = <>Digest.</>;

  return (
    <header className="px-6 md:px-12 lg:px-20 pt-10 pb-6 hairline border-t-0 border-b">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Link to="/" className="block">
            <p className="smallcaps mb-1">Fertility literature monitor</p>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
              {title}
            </h1>
          </Link>
        </div>
        <nav className="flex items-baseline gap-5 text-sm">
          {!onIndex && (
            <Link to="/" className="link-underline">
              ← All digests
            </Link>
          )}
          {!onBookmarks && (
            <Link to="/bookmarks" className="link-underline">
              ★ Bookmarks{starCount > 0 ? ` (${starCount})` : ""}
            </Link>
          )}
          {!onSettings && (
            <Link to="/settings" className="link-underline">
              ⚙ Settings
            </Link>
          )}
        </nav>
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
