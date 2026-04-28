#!/usr/bin/env python3
"""
Notification dispatcher for the fertility literature monitor.

Reads state/last_run_summary.json (written by fertility_litmonitor.py) and
sends an alert via ntfy.sh (push to phone) and/or Resend (email) — whichever
credentials are present in the environment.

Configuration (via environment variables)
-----------------------------------------
    NTFY_TOPIC          ntfy.sh topic name (e.g. "ben-fertility-litmon-x7q9")
                        Use a long, hard-to-guess string; ntfy is unauthenticated
    NTFY_SERVER         optional, defaults to https://ntfy.sh
    RESEND_API_KEY      Resend API key (https://resend.com)
    EMAIL_FROM          sender address (must be a verified Resend domain)
    EMAIL_TO            recipient address (where the alert goes)
    DASHBOARD_URL       URL to the deployed dashboard, e.g.
                        https://fertility-litmon.vercel.app

Behaviour
---------
- If new_papers > 0: sends "New papers found" alert with topic breakdown
- If new_papers == 0: silent by default (set NOTIFY_ON_EMPTY=1 to override)
- If both notifiers fail, exits non-zero so the GitHub Action surfaces the issue
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import requests


def load_summary(state_path: Path) -> dict[str, Any] | None:
    summary_path = state_path / "last_run_summary.json"
    if not summary_path.exists():
        print(f"No summary found at {summary_path}", file=sys.stderr)
        return None
    return json.loads(summary_path.read_text())


def topic_breakdown(summary: dict, topic_labels: dict[str, str]) -> str:
    counts = summary.get("topic_counts") or {}
    if not counts:
        return ""
    items = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    lines = []
    for key, n in items:
        label = topic_labels.get(key, key)
        lines.append(f"  • {label}: {n}")
    return "\n".join(lines)


def load_topic_labels(litmonitor_root: Path) -> dict[str, str]:
    """Read topic labels from the most recent digest JSON, so the
    notifier doesn't need to import the main script."""
    digests = sorted((litmonitor_root / "digests").glob("digest_*.json"), reverse=True)
    if not digests:
        return {}
    try:
        data = json.loads(digests[0].read_text())
        return {k: v.get("label", k) for k, v in data.get("topics", {}).items()}
    except Exception:
        return {}


def send_ntfy(*, topic: str, server: str, title: str, body: str,
              dashboard_url: str | None) -> bool:
    url = f"{server.rstrip('/')}/{topic}"
    headers = {
        "Title": title,
        "Priority": "default",
        "Tags": "microscope",
    }
    if dashboard_url:
        headers["Click"] = dashboard_url
        headers["Actions"] = f"view, Open dashboard, {dashboard_url}, clear=true"
    try:
        r = requests.post(url, data=body.encode("utf-8"), headers=headers, timeout=15)
        r.raise_for_status()
        print(f"✓ ntfy sent to {topic}")
        return True
    except Exception as e:
        print(f"✗ ntfy failed: {e}", file=sys.stderr)
        return False


def send_email_resend(*, api_key: str, sender: str, recipients: list[str],
                      subject: str, html_body: str, text_body: str) -> bool:
    try:
        r = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": sender,
                "to": recipients,
                "subject": subject,
                "text": text_body,
                "html": html_body,
            },
            timeout=15,
        )
        r.raise_for_status()
        print(f"✓ email sent to {', '.join(recipients)}")
        return True
    except Exception as e:
        print(f"✗ email failed: {e}", file=sys.stderr)
        return False


def build_messages(summary: dict, topic_labels: dict[str, str],
                   dashboard_url: str | None) -> tuple[str, str, str, str]:
    """Return (title, ntfy_body, email_subject, email_html)."""
    n = summary.get("new_papers", 0)
    digest_date = summary.get("run_at", "")[:10]
    breakdown = topic_breakdown(summary, topic_labels)

    if n == 0:
        title = "No new fertility papers this week"
        ntfy_body = f"Run completed {digest_date} — nothing new in the journals being monitored."
        email_subject = "[litmon] No new papers this week"
        email_html = f"<p>Weekly run completed on <strong>{digest_date}</strong>. No new papers since the last run.</p>"
        return title, ntfy_body, email_subject, email_html

    title = f"{n} new fertility paper{'s' if n != 1 else ''} this week"
    ntfy_body_parts = [f"{n} paper{'s' if n != 1 else ''} added in {digest_date} digest."]
    if breakdown:
        ntfy_body_parts.append("")
        ntfy_body_parts.append("By topic:")
        ntfy_body_parts.append(breakdown)
    ntfy_body = "\n".join(ntfy_body_parts)

    email_subject = f"[litmon] {n} new fertility paper{'s' if n != 1 else ''} — {digest_date}"

    breakdown_html = ""
    if summary.get("topic_counts"):
        rows = []
        for k, v in sorted(summary["topic_counts"].items(),
                           key=lambda kv: kv[1], reverse=True):
            label = topic_labels.get(k, k)
            rows.append(f"<li><strong>{label}</strong>: {v}</li>")
        breakdown_html = f"<ul>{''.join(rows)}</ul>"

    dashboard_link = ""
    if dashboard_url:
        dashboard_link = (
            f'<p><a href="{dashboard_url}" '
            f'style="display:inline-block;padding:10px 16px;'
            f'background:#1a1611;color:#f7f4ed;text-decoration:none;'
            f'font-family:Georgia,serif;">Open the dashboard →</a></p>'
        )

    email_html = (
        f'<div style="font-family:Georgia,serif;color:#1a1611;'
        f'max-width:560px;line-height:1.6;">'
        f'<h2 style="margin:0 0 12px;">Fertility literature digest — {digest_date}</h2>'
        f'<p>{n} new paper{"s" if n != 1 else ""} matched your search topics this week.</p>'
        f'{breakdown_html}'
        f'{dashboard_link}'
        f'<p style="font-size:12px;color:#6b6660;margin-top:24px;">'
        f'Sent automatically by your fertility-literature-monitor GitHub Action.</p>'
        f'</div>'
    )

    return title, ntfy_body, email_subject, email_html


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    litmonitor_root = repo_root / "litmonitor"
    state_path = litmonitor_root / "state"

    summary = load_summary(state_path)
    if summary is None:
        return 1

    n = summary.get("new_papers", 0)
    notify_on_empty = os.environ.get("NOTIFY_ON_EMPTY", "").lower() in ("1", "true", "yes")

    if n == 0 and not notify_on_empty:
        print("No new papers; skipping notification (NOTIFY_ON_EMPTY not set)")
        return 0

    topic_labels = load_topic_labels(litmonitor_root)
    dashboard_url = os.environ.get("DASHBOARD_URL", "").strip() or None

    title, ntfy_body, email_subject, email_html = build_messages(
        summary, topic_labels, dashboard_url
    )

    any_sent = False
    any_attempted = False

    ntfy_topic = os.environ.get("NTFY_TOPIC", "").strip()
    ntfy_server = os.environ.get("NTFY_SERVER", "").strip() or "https://ntfy.sh"
    if ntfy_topic:
        any_attempted = True
        if send_ntfy(topic=ntfy_topic, server=ntfy_server,
                     title=title, body=ntfy_body, dashboard_url=dashboard_url):
            any_sent = True

    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    email_from = os.environ.get("EMAIL_FROM", "").strip()
    email_to_raw = os.environ.get("EMAIL_TO", "").strip()
    email_to = [addr.strip() for addr in email_to_raw.split(",") if addr.strip()]
    if resend_key and email_from and email_to:
        any_attempted = True
        text_body = f"{title}\n\n{ntfy_body}\n\n{dashboard_url or ''}".strip()
        if send_email_resend(api_key=resend_key, sender=email_from,
                             recipients=email_to, subject=email_subject,
                             html_body=email_html, text_body=text_body):
            any_sent = True

    if not any_attempted:
        print("No notifier configured (set NTFY_TOPIC and/or RESEND_API_KEY+EMAIL_FROM+EMAIL_TO)",
              file=sys.stderr)
        return 0  # not a failure — just nothing to do

    return 0 if any_sent else 1


if __name__ == "__main__":
    sys.exit(main())
