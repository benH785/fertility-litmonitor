// GET  /api/searches  → returns current searches.json (no auth, public read)
// PUT  /api/searches  → body { searches: { ... } } commits new searches.json (auth required)

import { checkAuth, ghHeaders, repoConfig, jsonResponse } from "./_lib.js";

export default async function handler(req, res) {
  const { owner, name, branch, searchesPath } = repoConfig();
  if (!owner || !name) {
    return jsonResponse(res, 500, { error: "GH_REPO_OWNER/GH_REPO_NAME not configured" });
  }

  if (req.method === "GET") {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${searchesPath}?t=${Date.now()}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return jsonResponse(res, r.status, { error: `Failed to fetch searches.json (${r.status})` });
      const data = await r.json();
      return jsonResponse(res, 200, { searches: data });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  if (req.method === "PUT") {
    const auth = checkAuth(req);
    if (!auth.ok) return jsonResponse(res, auth.status, { error: auth.message });

    if (!process.env.GH_PAT) {
      return jsonResponse(res, 500, { error: "GH_PAT not configured on the server" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return jsonResponse(res, 400, { error: "Invalid JSON body" }); }
    }
    const searches = body?.searches;
    if (!searches || typeof searches !== "object") {
      return jsonResponse(res, 400, { error: "Body must be { searches: { ... } }" });
    }

    // Validate shape: every entry must have label, priority, query
    for (const [key, val] of Object.entries(searches)) {
      if (!key.match(/^[a-z0-9_]+$/)) {
        return jsonResponse(res, 400, { error: `Topic key "${key}" must be lowercase alphanumeric + underscore only` });
      }
      if (!val || typeof val !== "object") {
        return jsonResponse(res, 400, { error: `Topic "${key}" must be an object` });
      }
      if (typeof val.label !== "string" || !val.label.trim()) {
        return jsonResponse(res, 400, { error: `Topic "${key}" missing string field "label"` });
      }
      if (!["high", "medium", "low"].includes(val.priority)) {
        return jsonResponse(res, 400, { error: `Topic "${key}" priority must be high|medium|low` });
      }
      if (typeof val.query !== "string" || !val.query.trim()) {
        return jsonResponse(res, 400, { error: `Topic "${key}" missing string field "query"` });
      }
    }

    try {
      const apiBase = `https://api.github.com/repos/${owner}/${name}/contents/${searchesPath}`;

      // 1) GET current file to grab the sha (required for update)
      const getResp = await fetch(`${apiBase}?ref=${branch}`, { headers: ghHeaders() });
      if (!getResp.ok && getResp.status !== 404) {
        const txt = await getResp.text();
        return jsonResponse(res, getResp.status, { error: `GitHub GET failed: ${txt}` });
      }
      const existing = getResp.status === 404 ? null : await getResp.json();
      const sha = existing?.sha;

      // 2) PUT new content
      const newContent = JSON.stringify(searches, null, 2) + "\n";
      const putResp = await fetch(apiBase, {
        method: "PUT",
        headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Update search topics from dashboard",
          content: Buffer.from(newContent, "utf-8").toString("base64"),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!putResp.ok) {
        const txt = await putResp.text();
        return jsonResponse(res, putResp.status, { error: `GitHub PUT failed: ${txt}` });
      }
      const result = await putResp.json();
      return jsonResponse(res, 200, { ok: true, commit: result.commit?.sha });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return jsonResponse(res, 405, { error: "Method not allowed" });
}
