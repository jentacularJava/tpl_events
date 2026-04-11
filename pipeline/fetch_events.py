"""
fetch_events.py
Fetches Toronto Public Library events from the Toronto Open Data CKAN API,
cleans and reshapes the data, and writes events.json and meta.json.

Exits with code 0 in all normal cases (no update needed or update written).
Exits with code 1 on unrecoverable error.
"""

import csv
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

BASE_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca"
PACKAGE_ID = "library-branch-programs-and-events-feed"
DATA_DIR = Path(__file__).parent.parent / "data"
EVENTS_PATH = DATA_DIR / "events.json"
META_PATH = DATA_DIR / "meta.json"


def fetch_csv() -> str:
    """Fetch the raw CSV dump from the CKAN datastore."""
    url = BASE_URL + "/api/3/action/package_show"
    params = {"id": PACKAGE_ID}
    package = requests.get(url, params=params, timeout=30).json()

    for resource in package["result"]["resources"]:
        if resource["datastore_active"]:
            dump_url = BASE_URL + "/datastore/dump/" + resource["id"]
            response = requests.get(dump_url, timeout=60)
            response.raise_for_status()
            return response.text

    raise RuntimeError("No datastore_active resource found in package.")


def parse_csv(raw: str) -> pd.DataFrame:
    """Parse raw CSV text into a DataFrame."""
    return pd.read_csv(io.StringIO(raw), dtype=str).fillna("")


def extract_last_updated(df: pd.DataFrame) -> str:
    """Return the max LastUpdatedOn value from the dataset."""
    values = df["LastUpdatedOn"].dropna()
    values = values[values != ""]
    if values.empty:
        return ""
    return values.max()


def load_meta() -> dict:
    """Load existing meta.json, or return empty dict if it does not exist."""
    if META_PATH.exists():
        with open(META_PATH) as f:
            return json.load(f)
    return {}


def clean(df: pd.DataFrame) -> list[dict]:
    """
    Clean and reshape the DataFrame into a list of event dicts.
    Returns records sorted by date then start time ascending.
    """
    # Keep only ACTIVE events
    df = df[df["Status"].str.upper() == "ACTIVE"].copy()

    # Deduplicate on EventID, keep first occurrence
    df = df.drop_duplicates(subset="EventID", keep="first")

    # Parse StartTime and EndTime to extract date and HH:MM components
    # Timestamps are ISO format: 2026-03-06T14:00:00
    def extract_time(col: pd.Series) -> pd.Series:
        parsed = pd.to_datetime(col, errors="coerce")
        return parsed.dt.strftime("%H:%M").fillna("")

    df["startTime"] = extract_time(df["StartTime"])
    df["endTime"] = extract_time(df["EndTime"])

    # Use StartDateLocal as the canonical date (already YYYY-MM-DD)
    df["date"] = df["StartDateLocal"].str.strip()

    # Split multi-value fields into arrays
    def split_field(value: str) -> list[str]:
        if not value.strip():
            return []
        return [v.strip() for v in value.split(",") if v.strip()]

    df["audiences"] = df["Audiences"].apply(split_field)
    df["eventTypes"] = df["EventTypes"].apply(split_field)

    # Sort by date then startTime ascending
    df = df.sort_values(["date", "startTime"], ascending=True)

    # Build output records with only the fields the UI needs
    records = []
    for _, row in df.iterrows():
        records.append({
            "id": row["EventID"],
            "title": row["Title"].strip(),
            "date": row["date"],
            "startTime": row["startTime"],
            "endTime": row["endTime"],
            "location": row["LocationName"].strip(),
            "audiences": row["audiences"],
            "eventTypes": row["eventTypes"],
        })

    return records


def write_output(records: list[dict], last_updated: str) -> None:
    """Write events.json and meta.json to the data directory."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(EVENTS_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "lastUpdatedOn": last_updated,
        "recordCount": len(records),
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {len(records)} records to {EVENTS_PATH}")
    print(f"Meta: {meta}")


def main() -> None:
    print("Fetching Toronto Open Data library events...")

    try:
        raw = fetch_csv()
    except Exception as e:
        print(f"ERROR: Failed to fetch data: {e}", file=sys.stderr)
        sys.exit(1)

    df = parse_csv(raw)
    last_updated = extract_last_updated(df)
    print(f"Incoming LastUpdatedOn (max): {last_updated!r}")

    existing_meta = load_meta()
    existing_last_updated = existing_meta.get("lastUpdatedOn", "")
    print(f"Existing LastUpdatedOn:       {existing_last_updated!r}")

    if last_updated and last_updated == existing_last_updated:
        print("Data unchanged. No update needed.")
        sys.exit(0)

    print("Data is new or changed. Processing...")
    records = clean(df)
    write_output(records, last_updated)
    print("Done.")


if __name__ == "__main__":
    main()