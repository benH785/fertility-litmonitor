// Shared helpers for the Vercel serverless API.
//
// Env vars (set in Vercel project Settings → Environment Variables):
//   ADMIN_PASSWORD          shared password for editing topics
//   GH_PAT                  GitHub fine-grained PAT with Contents R/W + Actions R/W
//   GH_REPO_OWNER           e.g. "benH785"
//   GH_REPO_NAME            e.g. "fertility-litmonitor"
//   GH_REPO_BRANCH          e.g. "main"
//   GH_SEARCHES_PATH        e.g. "litmonitor/searches.json"
//   GH_WORKFLOW_FILE        e.g. "weekly_digest.yml"

export function checkAuth(req) {
  const password = req.headers["x-admin-password"];
  if (!process.env.ADMIN_PASSWORD) {
    return { ok: false, status: 500, message: "ADMIN_PASSWORD not configured on the server" };
  }
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return { ok: false, status: 401, message: "Invalid admin password" };
  }
  return { ok: true };
}

export function ghHeaders() {
  return {
    "Authorization": `token ${process.env.GH_PAT}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "fertility-litmonitor-dashboard",
  };
}

export function repoConfig() {
  return {
    owner: process.env.GH_REPO_OWNER,
    name: process.env.GH_REPO_NAME,
    branch: process.env.GH_REPO_BRANCH || "main",
    searchesPath: process.env.GH_SEARCHES_PATH || "litmonitor/searches.json",
    workflowFile: process.env.GH_WORKFLOW_FILE || "weekly_digest.yml",
  };
}

export function jsonResponse(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(body));
}
