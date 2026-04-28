# Fertility Literature Monitor

A weekly automated read of the fertility literature, focused on the questions that matter for the case file.

```
┌─────────────────┐     weekly cron      ┌────────────────┐
│ GitHub Actions  │  ─────────────────▶  │ Python script  │
└─────────────────┘                      │ + PubMed API   │
        │                                 └────────────────┘
        │                                          │
        │                                          ▼
        │                                 ┌────────────────┐
        │           commit JSON+MD        │ /digests/      │
        │  ◀──────────────────────────────│  *.json + *.md │
        ▼                                 └────────────────┘
┌─────────────────┐                                │
│ Notify (ntfy +  │                                │ raw.githubusercontent
│ email)          │                                │
└─────────────────┘                                ▼
        │                                 ┌────────────────┐
        ▼                                 │ React on       │
   📱 phone push                          │ Vercel         │
                                          └────────────────┘
```

## What's in here

```
.
├── litmonitor/                        # Python tool that searches PubMed
│   ├── fertility_litmonitor.py        # Main script
│   ├── requirements.txt
│   └── digests/                       # Generated digests live here
│       ├── digest_YYYY-MM-DD.md       # Human-readable
│       ├── digest_YYYY-MM-DD.json     # Dashboard data
│       └── index.json                 # List of all digests
├── notify/
│   └── notify.py                      # Sends ntfy push + email after each run
├── dashboard/                         # React app (Vite + Tailwind)
│   ├── src/
│   ├── package.json
│   └── …
├── .github/workflows/
│   └── weekly_digest.yml              # Runs Mondays 09:00 UTC
├── DEPLOYMENT.md                      # Full setup guide (start here)
└── README.md
```

## Quick start

Read [DEPLOYMENT.md](DEPLOYMENT.md). Roughly:

1. Push this to GitHub (public repo)
2. Run `python litmonitor/fertility_litmonitor.py --years 5` locally and commit the digests
3. Add `NTFY_TOPIC` secret in GitHub for phone push notifications
4. Deploy `dashboard/` to Vercel with `VITE_REPO_OWNER` and `VITE_REPO_NAME` set
5. Done — every Monday morning you get a push, tap it, the dashboard opens

## What it monitors

13 clinical-question topics across 12 fertility journals (Human Reproduction, Fertility & Sterility, RBMO, JARG, Andrology, etc.). Topics include the GnRH-agonist vs dual trigger debate, premature ovulation prevention, lead-follicle size, ZyMōt, sperm DNA fragmentation (single- and double-stranded), TESE for high DFI, PGT-A in advanced maternal age, blastocyst grading, and methylation/MTHFR.

The exact list lives in `litmonitor/fertility_litmonitor.py` — the `SEARCHES` dictionary at the top. Edit, add, or remove freely; each entry is a plain PubMed query.

## Cost

Free, end to end. GitHub Actions free tier covers the cron, Vercel free tier covers the dashboard, ntfy is free for personal use, Resend has a generous free email tier, NCBI's API is free. Total: £0/month.

## Privacy note

The data this system handles (literature search results) is public information. The repo is intended to be public so the dashboard can read it via raw URLs. If you want this private, see "Private repo path" in DEPLOYMENT.md — there's a server-side option, just adds complexity.
