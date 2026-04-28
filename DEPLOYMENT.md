# Deployment guide

End-to-end setup: GitHub repo → weekly cron → React dashboard → phone notifications. Roughly 30 minutes start to finish if you've used GitHub before.

The architecture in one sentence: a weekly GitHub Action runs the Python script, commits new digests as JSON+MD into the repo, fires a push notification, and the React dashboard on Vercel reads those JSON files directly from raw.githubusercontent.com.

---

## 1. Push the project to GitHub

```bash
cd fertility_litmonitor
git init
git add .
git commit -m "Initial commit"
gh repo create fertility-litmonitor --public --source=. --push
```

(`--public` matters: the dashboard reads the JSON via raw.githubusercontent.com, which doesn't authenticate easily from a browser. The digests don't contain personal data — they're literature search results — so public is fine. If you do need it private, see "Private repo path" at the bottom.)

If you don't have the `gh` CLI: create the repo on github.com, then `git remote add origin … && git push -u origin main`.

## 2. Get the initial digest into the repo

Run the retrospective sweep locally so the dashboard has something to show. From the repo root:

```bash
cd litmonitor
pip install -r requirements.txt
python fertility_litmonitor.py --years 5
cd ..
git add litmonitor/digests/ litmonitor/state/
git commit -m "Initial 5-year retrospective"
git push
```

This writes both `digest_YYYY-MM-DD.md` and `digest_YYYY-MM-DD.json`, and seeds `state/seen_pmids.json` so the weekly cron only surfaces genuinely new papers.

## 3. Set up notifications

You can configure either or both. ntfy is recommended for phone push.

### ntfy.sh (free push to phone)

1. Install the **ntfy** app on your phone (iOS / Android — both free).
2. Pick a long random topic name. Treat this like a password: anyone with the topic name can post to it. Example: `ben-fertility-litmon-x7q9k2pa`.
3. In the app, tap **+** → **Subscribe to topic** → enter the topic name.
4. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, name it `NTFY_TOPIC`, value is the topic string.

That's it. No accounts, no API keys.

### Email (Resend)

1. Sign up at https://resend.com (free tier: 100 emails/day).
2. Verify a sender domain, or use the sandbox sender `onboarding@resend.dev` for testing.
3. Create an API key in the Resend dashboard.
4. In GitHub Secrets, add:
   - `RESEND_API_KEY` — your Resend API key
   - `EMAIL_FROM` — verified sender, e.g. `litmon@yourdomain.com`
   - `EMAIL_TO` — where to send the alerts

If you want a "nothing new this week" email too, go to **Settings → Secrets and variables → Actions → Variables** and add `NOTIFY_ON_EMPTY` with value `1`.

### NCBI API key (optional, recommended)

Bumps the PubMed rate limit from 3 to 10 requests/sec. Get one free at https://www.ncbi.nlm.nih.gov/account/ → API key management. Add as `NCBI_API_KEY` in GitHub Secrets.

## 4. Test the GitHub Action manually

Repo page → **Actions** tab → **Weekly Fertility Literature Digest** → **Run workflow**. Click the run, watch the logs. A successful run should:

1. Fetch any new papers (probably zero on the first weekly run since you just did the retrospective)
2. Commit anything that changed
3. Send a notification (you should see your phone vibrate, assuming `NTFY_TOPIC` is set and you've subscribed)

The cron runs every Monday at 09:00 UTC (10:00 BST in summer, 09:00 GMT in winter). To change it, edit the `cron` line in `.github/workflows/weekly_digest.yml`.

## 5. Deploy the dashboard to Vercel

```bash
cd dashboard
npm install
```

Test locally first:

```bash
cp .env.example .env.local
# Edit .env.local to set VITE_REPO_OWNER and VITE_REPO_NAME
npm run dev
```

Open http://localhost:5173 — you should see the digest you just committed.

To deploy:

1. Sign up at https://vercel.com (free).
2. **Add New → Project → Import Git Repository →** select your `fertility-litmonitor` repo.
3. **Root Directory**: set to `dashboard`.
4. **Framework Preset**: Vite (auto-detected).
5. **Environment Variables**: add the same `VITE_REPO_OWNER`, `VITE_REPO_NAME`, `VITE_REPO_BRANCH` (= `main`), `VITE_DIGESTS_PATH` (= `litmonitor/digests`).
6. Deploy. You'll get a URL like `fertility-litmonitor.vercel.app`.

## 6. Tell the notifier where the dashboard lives

So that ntfy push notifications include a "tap to open dashboard" action:

GitHub repo → **Settings → Secrets and variables → Actions → Variables** tab → New repository variable. Name: `DASHBOARD_URL`, value: your Vercel URL (e.g. `https://fertility-litmonitor.vercel.app`). It's a Variable not a Secret because it's not sensitive.

## 7. Done

Every Monday morning you get a push notification on your phone. Tap it, the dashboard opens, you see the new papers grouped by topic with one-click access to PubMed.

---

## Customising

### Adding new search topics

Edit `litmonitor/fertility_litmonitor.py`, find the `SEARCHES` dictionary, add an entry:

```python
"endometrial_receptivity": {
    "label": "Endometrial receptivity testing",
    "priority": "medium",
    "query":
        '("ERA"[tiab] OR "endometrial receptivity"[tiab] '
        'OR "window of implantation"[tiab]) '
        'AND (IVF[tiab] OR FET[tiab])',
},
```

Commit and push. Next weekly run will pick up the new topic. To backfill historical results, run `python fertility_litmonitor.py --years 5 --keep-seen` locally and commit.

### Adding new journals

Edit the `JOURNALS` list. Use NLM abbreviations exactly as PubMed indexes them (find one by searching for a known paper on PubMed and copying the abbreviation from the citation).

### Changing the cron schedule

Edit `.github/workflows/weekly_digest.yml`, change the `cron` expression. Use https://crontab.guru to translate. Examples:
- `0 9 * * 1` — Mondays 09:00 UTC (default)
- `0 6 * * 1,4` — Mondays and Thursdays 06:00 UTC
- `0 12 1 * *` — first of every month at noon UTC

---

## Troubleshooting

**No notifications arriving.** Check the Action logs: was the notify step run? Did it print "✓ ntfy sent"? If yes, check the topic name in your phone app matches the `NTFY_TOPIC` secret exactly.

**403 errors from PubMed.** Add `NCBI_API_KEY`. Also possible from a heavily-used GitHub Actions runner IP — usually transient.

**Dashboard says "Couldn't fetch digests."** Confirm the repo is public and that `litmonitor/digests/index.json` exists in the repo. Browse to `https://raw.githubusercontent.com/<owner>/<name>/main/litmonitor/digests/index.json` directly to confirm.

**Build fails on Vercel with "Module not found".** Ensure Vercel **Root Directory** is set to `dashboard`, not the repo root.

**Read/star state lost between devices.** Read/star tracking is stored in `localStorage` and is per-browser. There's no sync. Adding cross-device sync is the only thing in this stack that would justify standing up a Railway server.

---

## Private repo path (advanced)

If you really need a private repo, the dashboard can't fetch raw URLs from a browser without auth. Two options:

1. **Server-side fetching**: Add a small Vercel Serverless Function (Node) that holds a GitHub PAT in env vars, fetches the JSON server-side, and exposes `/api/digests/index` and `/api/digests/[file]` to the React app. Modify `src/lib/api.js` to hit `/api/...` instead of raw URLs.
2. **Move the dashboard to Railway**: Run as an Express app with the GitHub PAT server-side. More moving parts, but if you're already paying for Railway it's clean.

Happy to wire either of those up if you decide you need it.

---

## Cost summary

- **GitHub** (free tier): 2,000 Actions minutes/month — this uses ~3 minutes/week.
- **Vercel** (free tier): plenty for personal use.
- **ntfy.sh** (free): no quota for personal use.
- **Resend** (free tier): 100 emails/day, 3,000/month.
- **NCBI API key** (free): no cost.

Total: £0/month, indefinitely, for the architecture as designed.
