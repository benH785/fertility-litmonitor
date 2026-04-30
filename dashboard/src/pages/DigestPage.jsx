import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchDigest } from "../lib/api.js";
import PaperCard from "../components/PaperCard.jsx";
import TopicFilter from "../components/TopicFilter.jsx";

export default function DigestPage() {
  const { filename } = useParams();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    setState({ status: "loading", data: null, error: null });
    fetchDigest(filename)
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((err) => setState({ status: "error", data: null, error: err.message }));
  }, [filename]);

  const activeTopic = params.get("topic") || "all";
  const query = params.get("q") || "";
  const showRead = params.get("read") === "1";

  const setActiveTopic = (t) => {
    const next = new URLSearchParams(params);
    if (t === "all") next.delete("topic");
    else next.set("topic", t);
    setParams(next, { replace: true });
  };

  const setQuery = (q) => {
    const next = new URLSearchParams(params);
    if (!q) next.delete("q");
    else next.set("q", q);
    setParams(next, { replace: true });
  };

  if (state.status === "loading") {
    return <p className="font-mono text-sm text-muted">Loading digest…</p>;
  }
  if (state.status === "error") {
    return (
      <div>
        <p className="font-display text-xl text-accent">Couldn't load digest.</p>
        <p className="text-sm text-muted mt-2 font-mono">{state.error}</p>
      </div>
    );
  }

  const digest = state.data;
  return (
    <DigestView
      digest={digest}
      activeTopic={activeTopic}
      setActiveTopic={setActiveTopic}
      query={query}
      setQuery={setQuery}
      showRead={showRead}
      setShowRead={(v) => {
        const next = new URLSearchParams(params);
        if (v) next.set("read", "1");
        else next.delete("read");
        setParams(next, { replace: true });
      }}
    />
  );
}

function DigestView({
  digest, activeTopic, setActiveTopic, query, setQuery,
  showRead, setShowRead,
}) {
  // Filter papers by topic + search query
  const filtered = useMemo(() => {
    let papers = digest.papers || [];
    if (activeTopic !== "all") {
      papers = papers.filter((p) => (p.matched_searches || []).includes(activeTopic));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      papers = papers.filter((p) =>
        (p.title || "").toLowerCase().includes(q)
        || (p.abstract || "").toLowerCase().includes(q)
        || (p.authors || []).join(" ").toLowerCase().includes(q)
        || (p.journal || "").toLowerCase().includes(q)
      );
    }
    return papers;
  }, [digest, activeTopic, query]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-x-12 gap-y-8 max-w-7xl">
      {/* Sidebar */}
      <aside className="lg:sticky lg:top-8 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto space-y-6 pr-2">
        <DigestMeta digest={digest} />

        <TopicFilter
          topics={digest.topics || {}}
          counts={digest.topic_counts || {}}
          active={activeTopic}
          onSelect={setActiveTopic}
        />

        <div>
          <p className="smallcaps mb-2">Search</p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, author, abstract…"
            className="w-full bg-paper-dim border border-rule px-3 py-2 text-sm font-mono focus:outline-none focus:border-ink"
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRead}
            onChange={(e) => setShowRead(e.target.checked)}
            className="accent-ink"
          />
          Show read papers
        </label>
      </aside>

      {/* Content */}
      <section className="min-w-0">
        <DigestHeader digest={digest} filteredCount={filtered.length} />

        {filtered.length === 0 ? (
          <p className="text-muted mt-12">
            {(digest.papers || []).length === 0
              ? "No new papers in this digest."
              : "No papers match the current filters."}
          </p>
        ) : (
          <ol className="mt-10 space-y-0">
            {filtered.map((p, i) => (
              <PaperCard
                key={p.pmid}
                paper={p}
                topics={digest.topics}
                index={i}
                showWhenRead={showRead}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function DigestMeta({ digest }) {
  return (
    <div>
      <p className="smallcaps mb-2">Digest</p>
      <p className="font-display text-xl leading-tight">{digest.digest_date}</p>
      <dl className="mt-3 text-xs font-mono text-muted space-y-1">
        <Row label="papers" value={digest.paper_count} />
        <Row label="window" value={`since ${digest.window_start}`} />
        <Row label="mode" value={digest.mode} />
      </dl>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3">
      <dt className="uppercase tracking-smallcaps">{label}</dt>
      <dd className="text-ink-soft">{value}</dd>
    </div>
  );
}

function DigestHeader({ digest, filteredCount }) {
  const total = (digest.papers || []).length;
  return (
    <header className="border-b border-rule pb-6">
      <p className="smallcaps">
        {digest.window_start} → {digest.digest_date}
      </p>
      <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight mt-2">
        {total} new {total === 1 ? "paper" : "papers"}
      </h1>
      {filteredCount !== total && (
        <p className="font-mono text-xs text-muted mt-3">
          showing {filteredCount} of {total} after filters
        </p>
      )}
    </header>
  );
}
