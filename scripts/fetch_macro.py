#!/usr/bin/env python3
"""Build data/macro.json from FRED (US/FX/risk) and the World Bank (India annual).

Needs a free FRED API key in the FRED_API_KEY environment variable
(https://fred.stlouisfed.org/docs/api/api_key.html). The World Bank needs no key.

Usage:
    FRED_API_KEY=xxxx python3 scripts/fetch_macro.py
    python3 scripts/fetch_macro.py --demo      # synthetic data, clearly flagged, for layout testing only

Series are listed in scripts/series.json. If one series fails, its previous
observations are kept and the failure is recorded in "errors".
"""
import argparse
import json
import math
import os
import random
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "scripts" / "series.json"
OUT = ROOT / "data" / "macro.json"
FREQ_PARAM = {"W": "w", "M": None, "A": None}   # FRED aggregation; daily series are downsampled to weekly


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "personal-macro-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fred_series(sid, key, years, freq):
    start = date.today().replace(year=date.today().year - years).isoformat()
    params = {"series_id": sid, "api_key": key, "file_type": "json", "observation_start": start}
    if FREQ_PARAM.get(freq):
        params.update({"frequency": FREQ_PARAM[freq], "aggregation_method": "eop"})
    data = get_json("https://api.stlouisfed.org/fred/series/observations?" + urllib.parse.urlencode(params))
    obs = []
    for o in data.get("observations", []):
        try:
            obs.append([o["date"], float(o["value"])])     # FRED uses "." for missing
        except ValueError:
            continue
    return obs


def yoy(obs):
    """Year-on-year % change for a monthly level series (compares with 12 observations earlier)."""
    return [[obs[i][0], round((obs[i][1] / obs[i - 12][1] - 1) * 100, 3)] for i in range(12, len(obs))]


def worldbank_series(indicator, country, years):
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}?format=json&per_page=200"
    data = get_json(url)
    rows = data[1] if isinstance(data, list) and len(data) > 1 and data[1] else []
    obs = [[f"{r['date']}-12-31", float(r["value"])] for r in rows if r.get("value") is not None]
    obs.sort()
    return obs[-max(years, 10):]


def demo_obs(freq, years, seed, base, vol):
    rnd = random.Random(seed)
    step = {"W": 7, "M": 30, "A": 365}[freq]
    n = int(years * 365 / step)
    out, v = [], base
    d0 = date.today()
    for i in range(n):
        v += rnd.gauss(0, vol) - 0.02 * (v - base)
        out.append([date.fromordinal(d0.toordinal() - (n - i) * step).isoformat(), round(v, 3)])
    return out


def load_previous():
    try:
        return {s["id"]: s for s in json.loads(OUT.read_text(encoding="utf-8")).get("series", [])}
    except (OSError, ValueError):
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="write synthetic data (flagged demo=true)")
    ap.add_argument("--years", type=int, default=12, help="history to keep")
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    prev = load_previous()
    series, errors = [], []

    if args.demo:
        for i, s in enumerate(cfg["fred"] + cfg["worldbank"]):
            base = {"%": 3.0, "index": 18.0}.get(s["units"], 80.0)
            series.append({**{k: s[k] for k in ("id", "name", "group", "units", "freq")},
                           "tile": s.get("tile", False), "source": "DEMO",
                           "obs": demo_obs(s["freq"], args.years, i + 1, base, base * 0.02 + 0.05)})
    else:
        key = os.environ.get("FRED_API_KEY")
        if not key:
            print("FRED_API_KEY is not set. Get a free key and export it (or use --demo).", file=sys.stderr)
            return 2
        for s in cfg["fred"]:
            try:
                obs = fred_series(s["id"], key, args.years + (1 if s.get("transform") == "yoy" else 0), s["freq"])
                if s.get("transform") == "yoy":
                    obs = yoy(obs)
                if not obs:
                    raise ValueError("empty")
                series.append({**{k: s[k] for k in ("id", "name", "group", "units", "freq")},
                               "tile": s.get("tile", False), "source": "FRED", "obs": obs})
                print(f"ok    FRED {s['id']}: {len(obs)} obs, last {obs[-1]}")
            except Exception as e:
                errors.append(f"{s['id']}: {type(e).__name__}")
                print(f"FAIL  FRED {s['id']}: {e}", file=sys.stderr)
                if s["id"] in prev:
                    series.append(prev[s["id"]])
        for s in cfg["worldbank"]:
            try:
                obs = worldbank_series(s["id"], s["country"], args.years)
                if not obs:
                    raise ValueError("empty")
                series.append({**{k: s[k] for k in ("name", "group", "units", "freq")},
                               "id": f"{s['country']}.{s['id']}", "tile": s.get("tile", False),
                               "source": "World Bank", "obs": obs})
                print(f"ok    WB   {s['id']}: {len(obs)} obs, last {obs[-1]}")
            except Exception as e:
                errors.append(f"{s['country']}.{s['id']}: {type(e).__name__}")
                print(f"FAIL  WB   {s['id']}: {e}", file=sys.stderr)
                pid = f"{s['country']}.{s['id']}"
                if pid in prev:
                    series.append(prev[pid])
        if not series:
            print("Nothing fetched; leaving existing data untouched.", file=sys.stderr)
            return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "demo": bool(args.demo),
        "errors": errors,
        "series": series,
    }, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(series)} series → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
