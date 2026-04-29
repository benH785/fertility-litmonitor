// Fetches digest data from the GitHub repo via raw.githubusercontent.com.
// Configure repo + branch via environment variables (set in Vercel project
// settings, or via .env.local during dev). Defaults provided so the app
// runs out of the box once you've replaced the placeholder repo string.
//
//   VITE_REPO_OWNER       e.g. "ben-kelly"
//   VITE_REPO_NAME        e.g. "fertility-litmonitor"
//   VITE_REPO_BRANCH      e.g. "main"
//   VITE_DIGESTS_PATH     e.g. "litmonitor/digests"   (default)

const OWNER = import.meta.env.VITE_REPO_OWNER || "REPLACE_ME";
const NAME = import.meta.env.VITE_REPO_NAME || "REPLACE_ME";
const BRANCH = import.meta.env.VITE_REPO_BRANCH || "main";
const DIGESTS_PATH = import.meta.env.VITE_DIGESTS_PATH || "litmonitor/digests";

const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${NAME}/${BRANCH}/${DIGESTS_PATH}`;

export const repoIsConfigured = () => OWNER !== "REPLACE_ME" && NAME !== "REPLACE_ME";

export const repoUrl = () =>
  repoIsConfigured() ? `https://github.com/${OWNER}/${NAME}` : null;

export async function fetchIndex() {
  const url = `${RAW_BASE}/index.json?t=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch index.json (${r.status})`);
  return r.json();
}

export async function fetchDigest(filename) {
  const url = `${RAW_BASE}/${filename}?t=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch ${filename} (${r.status})`);
  return r.json();
}

// Read/unread tracking — local to this browser, keyed by PMID
const READ_KEY = "litmon:read-pmids";

export function getReadPmids() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function markPmidRead(pmid, isRead = true) {
  const set = getReadPmids();
  if (isRead) set.add(pmid);
  else set.delete(pmid);
  localStorage.setItem(READ_KEY, JSON.stringify([...set]));
}

// Starred tracking — also local
const STAR_KEY = "litmon:starred-pmids";

export function getStarredPmids() {
  try {
    const raw = localStorage.getItem(STAR_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function toggleStarred(pmid) {
  const set = getStarredPmids();
  if (set.has(pmid)) set.delete(pmid);
  else set.add(pmid);
  localStorage.setItem(STAR_KEY, JSON.stringify([...set]));
  window.dispatchEvent(new CustomEvent("litmon:starred-changed"));
  return set.has(pmid);
}
