// POST /api/retrospective  → dispatches the workflow with mode=retrospective
// Auth required.

import { checkAuth, ghHeaders, repoConfig, jsonResponse } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }
  const auth = checkAuth(req);
  if (!auth.ok) return jsonResponse(res, auth.status, { error: auth.message });
  if (!process.env.GH_PAT) {
    return jsonResponse(res, 500, { error: "GH_PAT not configured on the server" });
  }

  const { owner, name, branch, workflowFile } = repoConfig();
  if (!owner || !name) {
    return jsonResponse(res, 500, { error: "GH_REPO_OWNER/GH_REPO_NAME not configured" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${name}/actions/workflows/${workflowFile}/dispatches`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: branch,
        inputs: { mode: "retrospective" },
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return jsonResponse(res, resp.status, { error: `GitHub workflow dispatch failed: ${txt}` });
    }
    return jsonResponse(res, 200, { ok: true, message: "Retrospective workflow dispatched" });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message });
  }
}
