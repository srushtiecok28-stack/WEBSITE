#!/usr/bin/env python3
"""Collect headlines from RSS/Atom feeds into data/news.json.

Standard library only. Stores title, link, source, date and a short plain-text
excerpt — never the full article. Each item links back to the publisher.

Usage:
    python3 scripts/fetch_news.py                       # fetch all feeds in feeds.json
    python3 scripts/fetch_news.py --file x.xml --source "Test" --category "Test"   # parse a local file
"""
import argparse
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEEDS = ROOT / "scripts" / "feeds.json"
OUT = ROOT / "data" / "news.json"

MAX_ITEMS = 400          # cap on stored items
MAX_AGE_DAYS = 21        # drop items older than this
SUMMARY_CHARS = 220
USER_AGENT = "personal-news-aggregator/1.0 (+RSS reader; contact via site owner)"

# Very simple keyword tagger — edit freely.
TAGS = {
    "Inflation": ["inflation", "cpi", "price index", "prices rose"],
    "Rates": ["interest rate", "rate cut", "rate hike", "repo rate", "fed funds", "policy rate", "mpc", "fomc"],
    "FX": ["rupee", "dollar", "euro", "yen", "currency", "forex", "exchange rate"],
    "Oil": ["crude", "oil price", "brent", "opec"],
    "Gold": ["gold price", " gold "],
    "Equities": ["sensex", "nifty", "s&p 500", "nasdaq", "stocks", "shares", "equity"],
    "Growth": ["gdp", "growth forecast", "recession", "pmi"],
    "RBI": ["rbi", "reserve bank of india"],
    "Fed": ["federal reserve", "fomc", "powell"],
    "ECB": ["european central bank", "ecb", "lagarde"],
}


def strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def local(tag):
    """Tag name without XML namespace."""
    return tag.rsplit("}", 1)[-1]


def parse_date(raw):
    if not raw:
        return None
    raw = raw.strip()
    try:
        dt = parsedate_to_datetime(raw)           # RSS: RFC 822
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))   # Atom: ISO 8601
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def child_text(node, names):
    for c in node:
        if local(c.tag) in names and (c.text or "").strip():
            return c.text.strip()
    return ""


def parse_feed(xml_bytes, source, category):
    root = ET.fromstring(xml_bytes)
    items = []
    for node in root.iter():
        kind = local(node.tag)
        if kind not in ("item", "entry"):
            continue
        title = strip_html(child_text(node, {"title"}))
        link = ""
        if kind == "item":
            link = child_text(node, {"link"})
        else:                                      # Atom: <link href="..."/>
            for c in node:
                if local(c.tag) == "link" and c.get("href"):
                    if c.get("rel", "alternate") == "alternate":
                        link = c.get("href")
                        break
                    link = link or c.get("href")
        if not title or not re.match(r"^https?://", link or "", re.I):
            continue
        summary = strip_html(child_text(node, {"description", "summary", "content", "encoded"}))
        if len(summary) > SUMMARY_CHARS:
            summary = summary[:SUMMARY_CHARS].rsplit(" ", 1)[0] + "…"
        dt = parse_date(child_text(node, {"pubDate", "published", "updated", "date"}))
        items.append({
            "title": title,
            "link": link,
            "source": source,
            "category": category,
            "published": dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else "",
            "summary": summary,
            "tags": tag_item(title + " " + summary),
        })
    return items


def tag_item(text):
    t = " " + text.lower() + " "
    return [name for name, kws in TAGS.items() if any(k in t for k in kws)]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def norm_key(it):
    return re.sub(r"\W+", "", it["title"].lower())[:90]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="parse a local feed file instead of fetching")
    ap.add_argument("--source", default="Local file")
    ap.add_argument("--category", default="Test")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    out = Path(args.out)

    new_items, errors = [], []
    if args.file:
        new_items = parse_feed(Path(args.file).read_bytes(), args.source, args.category)
    else:
        feeds = json.loads(FEEDS.read_text(encoding="utf-8"))
        for f in feeds:
            try:
                got = parse_feed(fetch(f["url"]), f["name"], f.get("category", ""))
                print(f"ok    {f['name']}: {len(got)} items")
                new_items += got
            except Exception as e:                  # one bad feed must not stop the rest
                errors.append(f"{f['name']}: {type(e).__name__}")
                print(f"FAIL  {f['name']}: {e}", file=sys.stderr)
        if feeds and not new_items:
            print("No items from any feed; leaving existing data untouched.", file=sys.stderr)
            return 1

    # Merge with history, dedupe by link then by normalised title
    old = []
    if out.exists():
        try:
            old = json.loads(out.read_text(encoding="utf-8")).get("items", [])
        except (ValueError, OSError):
            old = []
    # Undated items get a first-seen timestamp (kept stable across runs) so they age out normally
    first_seen = {o["link"]: o["published"] for o in old if o.get("published")}
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for it in new_items:
        if not it["published"]:
            it["published"] = first_seen.get(it["link"], now_iso)
    seen_link, seen_title, merged = set(), set(), []
    for it in new_items + old:                      # new first so fresh copy wins
        k = norm_key(it)
        if it["link"] in seen_link or k in seen_title:
            continue
        seen_link.add(it["link"]); seen_title.add(k); merged.append(it)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    merged = [i for i in merged if not i["published"] or i["published"] >= cutoff]
    merged.sort(key=lambda i: i["published"], reverse=True)
    merged = merged[:MAX_ITEMS]

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "errors": errors,
        "items": merged,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(merged)} items → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
