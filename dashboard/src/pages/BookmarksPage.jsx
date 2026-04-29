import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchIndex,
  fetchDigest,
  getStarredPmids,
  repoIsConfigured,
} from "../lib/api.js";
import PaperCard from "../components/PaperCard.jsx";

export default function BookmarksPage() {
  const [state, setState] = useState({ status: "loading", digests: [], error: null });
  const [starredPmids, setStarredPmids] = useState(() => getStarredPmids());

  useEffect(() => {
    if (!repoIsConfigured()) {
      setState({ status: "unconfigured", digests: [], error: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const index = await fetchIndex();
        const digests = await Promise.all(
          index.map((meta) => fetchDigest(meta.filename))
        );
        if (!cancelled) {
          setState({ status: "ready", digests, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ status: "error", digests: [], error: err.message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChange = () => setStarredPmids(getStarredPmids());
    window.addEventListener("litmon:starred-changed", onChange);
    return () => window.removeEventListener("litmon:starred-changed", onChange);
  }, []);

  const { papers, topics } = useMemo(() => {
    const seen = new Set();
    const collected = [];
    let mergedTopics = {};
    for (const d of state.digests) {
      mergedTopics = { ...mergedTopics, ...(d.topics || {}) };
      for (const p of d.papers || []) {
        if (starredPmids.has(p.pmid) && !seen.has(p.pmid)) {
          seen.add(p.pmid);
          collected.push({ ...p, _digestDate: d.digest_date });
        }
      }
    }
    collected.sort((a, b) => (b.pub_date || "").localeCompare(a.pub_date || ""));
    return { papers: collected, topics: mergedTopics };
  }, [state.digests, starredPmids]);

  if (state.status === "unconfigured") {
    return (
      <div className="max-w-reading">
        <p className="font-display text-xl text-ink-soft">
          Configure your repository to see bookmarks.
        </p>
      </div>
    );
  }
  if (state.status === "loading") {
    return <p className="font-mono text-sm text-muted">Loading bookmarks…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="max-w-reading">
        <p className="font-display text-xl text-accent">Couldn't load bookmarks.</p>
        <p className="text-sm text-muted mt-2 font-mono">{state.error}</p>
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <div className="max-w-reading">
        <p className="font-display text-xl text-ink-soft">
          No bookmarks yet.
        </p>
        <p className="text-muted mt-3">
          Open any digest and tap <span className="font-mono">☆ star</span> on
          a paper to bookmark it. Bookmarks are stored in this browser only.
        </p>
        <p className="text-muted mt-4">
          <Link to="/" className="link-underline">← Back to digests</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <header className="border-b border-rule pb-6">
        <p className="smallcaps">Saved papers</p>
        <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight mt-2">
          {papers.length} {papers.length === 1 ? "bookmark" : "bookmarks"}
        </h1>
        <p className="font-mono text-xs text-muted mt-3">
          stored locally · this browser only
        </p>
      </header>

      <ol className="mt-10 space-y-0">
        {papers.map((p, i) => (
          <PaperCard
            key={p.pmid}
            paper={p}
            topics={topics}
            index={i}
            showWhenRead={true}
          />
        ))}
      </ol>
    </div>
  );
}
