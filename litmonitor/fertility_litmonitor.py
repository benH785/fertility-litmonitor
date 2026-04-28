#!/usr/bin/env python3
"""
Fertility Literature Monitor
============================
Searches PubMed across selected fertility journals for studies relevant to
a defined set of clinical questions. Tracks seen PMIDs so subsequent runs
surface only new papers. Produces both a markdown digest (for direct reading)
and a JSON file (for the React dashboard).

Usage
-----
First run (retrospective sweep, default last 5 years):
    python fertility_litmonitor.py --years 5

Weekly run (only papers added since last run):
    python fertility_litmonitor.py --weekly

Custom date range:
    python fertility_litmonitor.py --since 2024-01-01

Outputs
-------
    digests/digest_YYYY-MM-DD.md         (this run's findings, human-readable)
    digests/digest_YYYY-MM-DD.json       (this run's findings, dashboard-ready)
    digests/index.json                   (list of all digests for the dashboard)
    state/seen_pmids.json                (PMIDs already reported)
    state/run_log.json                   (run history)
    state/last_run_summary.json          (summary of most recent run, used by
                                          the GitHub Actions notify step)

Environment variables
---------------------
    NCBI_API_KEY       (optional) — bumps PubMed rate limit from 3 to 10 req/s

Requirements
------------
    pip install requests
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import requests


# ---------------------------------------------------------------------------
# CONFIG: clinical questions and journal targets
# ---------------------------------------------------------------------------

SEARCHES: dict[str, dict] = {

    "agonist_vs_dual_trigger": {
        "label": "Dual vs agonist trigger",
        "priority": "high",
        "query":
            '("dual trigger"[tiab] OR "dual triggering"[tiab] '
            'OR "GnRH agonist trigger"[tiab] OR "agonist trigger"[tiab]) '
            'AND (IVF[tiab] OR ICSI[tiab] OR "ovarian stimulation"[tiab])',
    },

    "agonist_trigger_suboptimal": {
        "label": "Suboptimal agonist trigger response",
        "priority": "high",
        "query":
            '("suboptimal response"[tiab] OR "empty follicle"[tiab] '
            'OR "poor response to trigger"[tiab] OR "LH surge inadequate"[tiab]) '
            'AND (agonist[tiab] OR triptorelin[tiab] OR buserelin[tiab] OR leuprolide[tiab])',
    },

    "premature_ovulation": {
        "label": "Premature ovulation",
        "priority": "high",
        "query":
            '("premature ovulation"[tiab] OR "premature LH surge"[tiab] '
            'OR "early ovulation"[tiab]) AND (IVF[tiab] OR "oocyte retrieval"[tiab])',
    },

    "lead_follicle_oversize": {
        "label": "Lead follicle size & trigger timing",
        "priority": "high",
        "query":
            '("lead follicle"[tiab] OR "follicle size"[tiab] OR "trigger timing"[tiab]) '
            'AND (oocyte[tiab] OR maturity[tiab] OR "trigger day"[tiab])',
    },

    "zymot_microfluidic": {
        "label": "ZyMōt / microfluidic sperm selection",
        "priority": "medium",
        "query":
            '("ZyMot"[tiab] OR "microfluidic sperm"[tiab] OR "Fertile Chip"[tiab] '
            'OR "microfluidic sorting"[tiab])',
    },

    "sperm_dna_fragmentation": {
        "label": "Sperm DNA fragmentation & ART",
        "priority": "high",
        "query":
            '("DNA fragmentation"[tiab] OR "sperm DNA damage"[tiab] '
            'OR "double strand DNA break"[tiab] OR "sperm chromatin"[tiab]) '
            'AND (IVF[tiab] OR ICSI[tiab] OR ART[tiab] OR "live birth"[tiab])',
    },

    "tese_high_dfi": {
        "label": "TESE for high DFI",
        "priority": "high",
        "query":
            '(TESE[tiab] OR "testicular sperm"[tiab] OR "testicular extraction"[tiab]) '
            'AND ("high DNA fragmentation"[tiab] OR "DFI"[tiab] OR oligospermia[tiab] '
            'OR "ejaculated sperm"[tiab])',
    },

    "pgta_advanced_age": {
        "label": "PGT-A in advanced maternal age",
        "priority": "medium",
        "query":
            '("PGT-A"[tiab] OR "preimplantation genetic testing"[tiab] '
            'OR "aneuploidy screening"[tiab]) '
            'AND ("advanced maternal age"[tiab] OR "AMA"[tiab] OR "older women"[tiab])',
    },

    "blastocyst_grading_outcomes": {
        "label": "Blastocyst grading & outcomes",
        "priority": "medium",
        "query":
            '("Gardner grading"[tiab] OR "blastocyst grade"[tiab] '
            'OR "trophectoderm grade"[tiab] OR "ICM grade"[tiab]) '
            'AND ("live birth"[tiab] OR "implantation"[tiab] OR euploid[tiab])',
    },

    "antagonist_protocol_normoresponder": {
        "label": "Antagonist protocol in normo-responders",
        "priority": "medium",
        "query":
            '("antagonist protocol"[tiab] OR "GnRH antagonist"[tiab]) '
            'AND ("normal responder"[tiab] OR "normoresponder"[tiab] '
            'OR "ovarian stimulation"[tiab])',
    },

    "intercycle_interval": {
        "label": "Inter-cycle interval",
        "priority": "low",
        "query":
            '("inter-cycle interval"[tiab] OR "consecutive cycles"[tiab] '
            'OR "back-to-back IVF"[tiab] OR "cycle interval"[tiab])',
    },

    "methylation_mthfr_art": {
        "label": "MTHFR / methylation & ART",
        "priority": "medium",
        "query":
            '(MTHFR[tiab] OR methylation[tiab] OR homocysteine[tiab] '
            'OR folate[tiab] OR methylfolate[tiab]) '
            'AND (IVF[tiab] OR ICSI[tiab] OR "live birth"[tiab] OR miscarriage[tiab])',
    },

    "one_pn_embryos": {
        "label": "1PN / abnormal fertilisation",
        "priority": "low",
        "query":
            '("1PN"[tiab] OR "monopronuclear"[tiab] OR "abnormal fertilization"[tiab]) '
            'AND (ICSI[tiab] OR IVF[tiab] OR blastocyst[tiab])',
    },
}

JOURNALS: list[str] = [
    "Hum Reprod",
    "Hum Reprod Update",
    "Hum Reprod Open",
    "Fertil Steril",
    "F S Rep",
    "F S Sci",
    "Reprod Biomed Online",
    "J Assist Reprod Genet",
    "Reprod Biol Endocrinol",
    "Hum Fertil (Camb)",
    "Reprod Sci",
    "Andrology",
]


# ---------------------------------------------------------------------------
# PubMed E-utilities client
# ---------------------------------------------------------------------------

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
USER_AGENT = "FertilityLitMonitor/2.0 (personal research use)"

NCBI_API_KEY = os.environ.get("NCBI_API_KEY", "").strip()
REQUEST_DELAY_SECONDS = 0.12 if NCBI_API_KEY else 0.4


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass
class Paper:
    pmid: str
    title: str
    journal: str
    pub_date: str
    authors: list[str]
    abstract: str
    doi: str | None
    matched_searches: list[str] = field(default_factory=list)

    @property
    def pubmed_url(self) -> str:
        return f"https://pubmed.ncbi.nlm.nih.gov/{self.pmid}/"

    @property
    def doi_url(self) -> str | None:
        return f"https://doi.org/{self.doi}" if self.doi else None

    def to_json(self) -> dict:
        d = asdict(self)
        d["pubmed_url"] = self.pubmed_url
        d["doi_url"] = self.doi_url
        return d


def _journals_clause() -> str:
    return "(" + " OR ".join(f'"{j}"[Journal]' for j in JOURNALS) + ")"


def _date_clause(since: datetime, until: datetime | None = None) -> str:
    until = until or _now()
    return (
        f'("{since:%Y/%m/%d}"[Date - Publication] : '
        f'"{until:%Y/%m/%d}"[Date - Publication])'
    )


def _add_api_key(params: dict) -> dict:
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY
    return params


def esearch(query: str, since: datetime, retmax: int = 200) -> list[str]:
    full_query = f"({query}) AND {_journals_clause()} AND {_date_clause(since)}"
    params = _add_api_key({
        "db": "pubmed",
        "term": full_query,
        "retmax": retmax,
        "retmode": "json",
        "sort": "pub_date",
    })
    r = requests.get(
        f"{EUTILS}/esearch.fcgi",
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    time.sleep(REQUEST_DELAY_SECONDS)
    return data.get("esearchresult", {}).get("idlist", [])


def efetch(pmids: Iterable[str]) -> list[Paper]:
    pmids = list(pmids)
    if not pmids:
        return []

    papers: list[Paper] = []
    for i in range(0, len(pmids), 100):
        chunk = pmids[i:i + 100]
        params = _add_api_key({
            "db": "pubmed",
            "id": ",".join(chunk),
            "retmode": "xml",
        })
        r = requests.get(
            f"{EUTILS}/efetch.fcgi",
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=60,
        )
        r.raise_for_status()
        time.sleep(REQUEST_DELAY_SECONDS)
        papers.extend(_parse_efetch_xml(r.content))
    return papers


def _parse_efetch_xml(xml_bytes: bytes) -> list[Paper]:
    root = ET.fromstring(xml_bytes)
    papers: list[Paper] = []

    for art in root.findall(".//PubmedArticle"):
        pmid_el = art.find(".//PMID")
        pmid = pmid_el.text if pmid_el is not None else ""

        title_el = art.find(".//ArticleTitle")
        title = "".join(title_el.itertext()).strip() if title_el is not None else "(no title)"

        journal_el = art.find(".//Journal/ISOAbbreviation")
        journal = journal_el.text if journal_el is not None else "(unknown journal)"

        pub_date = ""
        adate = art.find(".//ArticleDate")
        if adate is not None:
            y = adate.findtext("Year", "")
            m = adate.findtext("Month", "")
            d = adate.findtext("Day", "")
            pub_date = "-".join(x for x in (y, m, d) if x)
        if not pub_date:
            pdate = art.find(".//Journal/JournalIssue/PubDate")
            if pdate is not None:
                y = pdate.findtext("Year", "")
                m = pdate.findtext("Month", "")
                d = pdate.findtext("Day", "")
                pub_date = "-".join(x for x in (y, m, d) if x)

        authors: list[str] = []
        for author in art.findall(".//AuthorList/Author"):
            last = author.findtext("LastName", "")
            initials = author.findtext("Initials", "")
            if last:
                authors.append(f"{last} {initials}".strip())
            else:
                col = author.findtext("CollectiveName", "")
                if col:
                    authors.append(col)

        abstract_parts = []
        for ab in art.findall(".//Abstract/AbstractText"):
            label = ab.attrib.get("Label")
            text = "".join(ab.itertext()).strip()
            if label:
                abstract_parts.append(f"{label}: {text}")
            else:
                abstract_parts.append(text)
        abstract = "\n\n".join(abstract_parts) if abstract_parts else "(no abstract available)"

        doi = None
        for aid in art.findall(".//ArticleIdList/ArticleId"):
            if aid.attrib.get("IdType") == "doi":
                doi = aid.text
                break

        papers.append(Paper(
            pmid=pmid,
            title=title,
            journal=journal,
            pub_date=pub_date,
            authors=authors,
            abstract=abstract,
            doi=doi,
        ))

    return papers


# ---------------------------------------------------------------------------
# State management
# ---------------------------------------------------------------------------

class State:
    def __init__(self, root: Path):
        self.root = root
        self.state_dir = root / "state"
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.seen_path = self.state_dir / "seen_pmids.json"
        self.log_path = self.state_dir / "run_log.json"
        self.summary_path = self.state_dir / "last_run_summary.json"
        self.seen: set[str] = set(self._load_json(self.seen_path, default=[]))
        self.log: list[dict] = self._load_json(self.log_path, default=[])

    @staticmethod
    def _load_json(path: Path, default):
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return default

    def mark_seen(self, pmids: Iterable[str]) -> None:
        self.seen.update(pmids)

    def already_seen(self, pmid: str) -> bool:
        return pmid in self.seen

    def record_run(self, *, mode: str, since: str, new_count: int,
                   total_seen: int, digest_filename: str,
                   topic_counts: dict[str, int]) -> None:
        entry = {
            "run_at": _now().isoformat(timespec="seconds") + "Z",
            "mode": mode,
            "since": since,
            "new_papers": new_count,
            "total_seen": total_seen,
            "digest_filename": digest_filename,
            "topic_counts": topic_counts,
        }
        self.log.append(entry)
        self.summary_path.write_text(json.dumps(entry, indent=2))

    def save(self) -> None:
        self.seen_path.write_text(json.dumps(sorted(self.seen), indent=2))
        self.log_path.write_text(json.dumps(self.log, indent=2))

    @property
    def last_run_date(self) -> datetime | None:
        if not self.log:
            return None
        last = self.log[-1]["run_at"]
        return datetime.fromisoformat(last.rstrip("Z"))


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def run_searches(since: datetime) -> dict[str, Paper]:
    pmid_to_paper: dict[str, Paper] = {}
    pmid_to_searches: dict[str, list[str]] = {}

    print(f"Searching {len(SEARCHES)} topics across {len(JOURNALS)} journals "
          f"since {since:%Y-%m-%d}...", file=sys.stderr)

    for name, cfg in SEARCHES.items():
        try:
            pmids = esearch(cfg["query"], since)
        except Exception as e:
            print(f"  [{name}] search failed: {e}", file=sys.stderr)
            continue
        print(f"  [{name}] {len(pmids)} hits", file=sys.stderr)
        for pmid in pmids:
            pmid_to_searches.setdefault(pmid, []).append(name)

    all_pmids = list(pmid_to_searches.keys())
    if not all_pmids:
        return {}

    print(f"Fetching details for {len(all_pmids)} unique papers...", file=sys.stderr)
    papers = efetch(all_pmids)
    for p in papers:
        p.matched_searches = pmid_to_searches.get(p.pmid, [])
        pmid_to_paper[p.pmid] = p

    return pmid_to_paper


# ---------------------------------------------------------------------------
# Output rendering
# ---------------------------------------------------------------------------

def render_digest_markdown(papers: list[Paper], *, since: datetime, mode: str) -> str:
    today = _now().strftime("%Y-%m-%d")
    lines: list[str] = []
    lines.append(f"# Fertility Literature Digest — {today}")
    lines.append("")
    lines.append(f"_Mode_: **{mode}**  ")
    lines.append(f"_Window_: papers published since {since:%Y-%m-%d}  ")
    lines.append(f"_New papers in this digest_: **{len(papers)}**  ")
    lines.append(f"_Journals monitored_: {', '.join(JOURNALS)}")
    lines.append("")

    if not papers:
        lines.append("_No new relevant papers found in this run._")
        return "\n".join(lines)

    by_topic: dict[str, list[Paper]] = {}
    for p in papers:
        for s in p.matched_searches or ["(unmatched)"]:
            by_topic.setdefault(s, []).append(p)

    lines.append("## Topics covered in this digest")
    lines.append("")
    for topic in sorted(by_topic.keys()):
        label = SEARCHES.get(topic, {}).get("label", topic)
        anchor = topic.replace("_", "-")
        lines.append(f"- [{label}](#{anchor}) — {len(by_topic[topic])} paper(s)")
    lines.append("")

    for topic in sorted(by_topic.keys()):
        label = SEARCHES.get(topic, {}).get("label", topic)
        anchor = topic.replace("_", "-")
        lines.append(f"## {label}")
        lines.append("")
        topic_papers = sorted(by_topic[topic], key=lambda p: p.pub_date, reverse=True)
        for p in topic_papers:
            authors_str = ", ".join(p.authors[:3])
            if len(p.authors) > 3:
                authors_str += f", et al. ({len(p.authors)} authors)"
            lines.append(f"### {p.title}")
            lines.append("")
            lines.append(f"**{p.journal}** · {p.pub_date} · PMID {p.pmid}  ")
            lines.append(f"{authors_str}")
            lines.append("")
            other_topics = [SEARCHES.get(s, {}).get("label", s)
                            for s in p.matched_searches if s != topic]
            if other_topics:
                lines.append(f"_Also matches_: {', '.join(other_topics)}")
                lines.append("")
            lines.append(p.abstract)
            lines.append("")
            lines.append(f"[PubMed]({p.pubmed_url})" + (
                f" · [DOI]({p.doi_url})" if p.doi_url else ""
            ))
            lines.append("")
            lines.append("---")
            lines.append("")

    return "\n".join(lines)


def render_digest_json(papers: list[Paper], *, since: datetime, mode: str,
                       digest_date: str) -> dict:
    topic_counts: dict[str, int] = {}
    for p in papers:
        for s in p.matched_searches:
            topic_counts[s] = topic_counts.get(s, 0) + 1

    return {
        "digest_date": digest_date,
        "generated_at": _now().isoformat(timespec="seconds") + "Z",
        "mode": mode,
        "window_start": since.strftime("%Y-%m-%d"),
        "paper_count": len(papers),
        "topic_counts": topic_counts,
        "topics": {
            key: {
                "label": cfg["label"],
                "priority": cfg.get("priority", "medium"),
            }
            for key, cfg in SEARCHES.items()
        },
        "journals_monitored": JOURNALS,
        "papers": [p.to_json() for p in papers],
    }


def update_index(digests_dir: Path) -> None:
    """Build/update digests/index.json with metadata for every digest file."""
    entries: list[dict] = []
    for path in sorted(digests_dir.glob("digest_*.json")):
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        entries.append({
            "filename": path.name,
            "digest_date": data.get("digest_date"),
            "generated_at": data.get("generated_at"),
            "mode": data.get("mode"),
            "paper_count": data.get("paper_count", 0),
            "topic_counts": data.get("topic_counts", {}),
        })
    entries.sort(key=lambda e: e.get("digest_date", ""), reverse=True)
    (digests_dir / "index.json").write_text(json.dumps(entries, indent=2))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--years", type=int, help="Look back N years (retrospective sweep)")
    g.add_argument("--weekly", action="store_true", help="Show only papers added since last run")
    g.add_argument("--since", type=str, help="Custom start date YYYY-MM-DD")
    p.add_argument("--out", type=str, default=".", help="Output root (default: current dir)")
    p.add_argument("--keep-seen", action="store_true",
                   help="Skip already-seen PMIDs even on retrospective runs")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    out_root = Path(args.out).resolve()
    out_root.mkdir(parents=True, exist_ok=True)
    digests_dir = out_root / "digests"
    digests_dir.mkdir(exist_ok=True)

    state = State(out_root)

    if args.since:
        since = datetime.strptime(args.since, "%Y-%m-%d")
        mode = f"custom since {args.since}"
        skip_seen = args.keep_seen
    elif args.weekly:
        if state.last_run_date:
            since = state.last_run_date - timedelta(days=2)
        else:
            since = _now() - timedelta(days=14)
        mode = "weekly"
        skip_seen = True
    else:
        years = args.years if args.years else 5
        since = _now() - timedelta(days=365 * years)
        mode = f"retrospective {years}y"
        skip_seen = args.keep_seen

    pmid_to_paper = run_searches(since)

    if skip_seen:
        new_papers = [p for p in pmid_to_paper.values() if not state.already_seen(p.pmid)]
    else:
        new_papers = list(pmid_to_paper.values())
    new_papers.sort(key=lambda p: p.pub_date, reverse=True)

    digest_date = _now().strftime("%Y-%m-%d")
    md_path = digests_dir / f"digest_{digest_date}.md"
    json_path = digests_dir / f"digest_{digest_date}.json"

    md_path.write_text(render_digest_markdown(new_papers, since=since, mode=mode))
    json_path.write_text(json.dumps(
        render_digest_json(new_papers, since=since, mode=mode, digest_date=digest_date),
        indent=2,
    ))

    topic_counts: dict[str, int] = {}
    for p in new_papers:
        for s in p.matched_searches:
            topic_counts[s] = topic_counts.get(s, 0) + 1

    state.mark_seen(p.pmid for p in pmid_to_paper.values())
    state.record_run(
        mode=mode,
        since=since.strftime("%Y-%m-%d"),
        new_count=len(new_papers),
        total_seen=len(state.seen),
        digest_filename=md_path.name,
        topic_counts=topic_counts,
    )
    state.save()

    update_index(digests_dir)

    print(f"\nWrote markdown digest:  {md_path}")
    print(f"Wrote JSON digest:      {json_path}")
    print(f"Updated index:          {digests_dir / 'index.json'}")
    print(f"New papers in this run: {len(new_papers)}")
    print(f"Total PMIDs tracked:    {len(state.seen)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
