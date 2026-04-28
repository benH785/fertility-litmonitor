import { useEffect, useState } from "react";
import {
  getReadPmids,
  markPmidRead,
  getStarredPmids,
  toggleStarred,
} from "../lib/api.js";

export default function PaperCard({ paper, topics, index, showWhenRead }) {
  const [expanded, setExpanded] = useState(false);
  const [isRead, setIsRead] = useState(false);
  const [isStarred, setIsStarred] = useState(false);

  useEffect(() => {
    setIsRead(getReadPmids().has(paper.pmid));
    setIsStarred(getStarredPmids().has(paper.pmid));
  }, [paper.pmid]);

  if (isRead && !showWhenRead) {
    return null;
  }

  const matchedTopics = (paper.matched_searches || []).map(
    (s) => topics?.[s]?.label || s
  );
  const hasHighPriority = (paper.matched_searches || []).some(
    (s) => topics?.[s]?.priority === "high"
  );

  const authorsText = formatAuthors(paper.authors);

  const onToggleRead = () => {
    const next = !isRead;
    setIsRead(next);
    markPmidRead(paper.pmid, next);
  };

  const onToggleStar = () => {
    const next = toggleStarred(paper.pmid);
    setIsStarred(next);
  };

  return (
    <li
      className={`hairline first:border-t-0 py-7 md:py-8 transition-opacity ${
        isRead ? "opacity-50" : ""
      }`}
    >
      <article className="grid grid-cols-[auto_1fr] gap-x-5 md:gap-x-7">
        <span className="font-mono text-xs text-muted-soft tabular-nums pt-1.5">
          {String(index + 1).padStart(2, "0")}
        </span>

        <div className="min-w-0">
          {/* Metadata line */}
          <div className="flex items-center gap-3 flex-wrap mb-2">
            {hasHighPriority && (
              <span
                className="text-accent text-base leading-none"
                title="Matches a high-priority case topic"
              >
                ★
              </span>
            )}
            <span className="smallcaps !text-ink-soft">
              {paper.journal}
            </span>
            <span className="text-muted-soft">·</span>
            <span className="font-mono text-xs text-muted">
              {paper.pub_date || "no date"}
            </span>
            <span className="text-muted-soft">·</span>
            <a
              href={paper.pubmed_url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-muted hover:text-ink transition-colors"
              title="View on PubMed"
            >
              PMID {paper.pmid}
            </a>
          </div>

          {/* Title */}
          <h3 className="font-display text-xl md:text-[1.55rem] leading-snug font-medium tracking-tight">
            <a
              href={paper.pubmed_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-accent transition-colors"
            >
              {paper.title}
            </a>
          </h3>

          {/* Authors */}
          {authorsText && (
            <p className="mt-2 text-sm text-ink-soft italic">
              {authorsText}
            </p>
          )}

          {/* Topics */}
          {matchedTopics.length > 0 && (
            <p className="mt-3 text-xs text-muted font-mono">
              {matchedTopics.join(" · ")}
            </p>
          )}

          {/* Abstract */}
          {paper.abstract && paper.abstract !== "(no abstract available)" && (
            <div className="mt-4">
              {expanded ? (
                <div className="text-[0.95rem] leading-relaxed text-ink-soft max-w-reading whitespace-pre-line font-display">
                  {paper.abstract}
                </div>
              ) : (
                <p className="text-[0.95rem] leading-relaxed text-ink-soft max-w-reading line-clamp-3 font-display">
                  {firstSentences(paper.abstract, 2)}
                </p>
              )}
              <button
                className="mt-2 text-xs font-mono text-teal hover:text-ink transition-colors"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "− collapse abstract" : "+ read full abstract"}
              </button>
            </div>
          )}

          {/* Action row */}
          <div className="mt-5 flex items-center gap-5 flex-wrap text-xs font-mono">
            <a
              href={paper.pubmed_url}
              target="_blank"
              rel="noreferrer"
              className="link-underline"
            >
              PubMed
            </a>
            {paper.doi_url && (
              <a
                href={paper.doi_url}
                target="_blank"
                rel="noreferrer"
                className="link-underline"
              >
                DOI
              </a>
            )}
            <button
              onClick={onToggleStar}
              className={`uppercase tracking-smallcaps transition-colors ${
                isStarred
                  ? "text-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {isStarred ? "★ starred" : "☆ star"}
            </button>
            <button
              onClick={onToggleRead}
              className="uppercase tracking-smallcaps text-muted hover:text-ink transition-colors"
            >
              {isRead ? "● read" : "○ mark as read"}
            </button>
          </div>
        </div>
      </article>
    </li>
  );
}

function formatAuthors(authors) {
  if (!authors || authors.length === 0) return "";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")}, et al. (${authors.length} authors)`;
}

function firstSentences(text, n) {
  // Take the first n sentence-ish chunks
  const chunks = text.split(/(?<=[.!?])\s+/).slice(0, n);
  return chunks.join(" ");
}
