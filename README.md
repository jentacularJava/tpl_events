# TPL Events Finder

A community-built tool to search and filter Toronto Public Library branch programs and events.

Data is sourced from [Toronto Open Data](https://open.toronto.ca/dataset/library-branch-programs-and-events-feed/) and refreshed daily via GitHub Actions.

---

## Setup

### 1. Fork or clone this repository

### 2. Enable GitHub Pages

Go to **Settings > Pages** and set:
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`

Your site will be live at `https://<your-username>.github.io/<repo-name>/`

### 3. Allow GitHub Actions to write to the repository

Go to **Settings > Actions > General > Workflow permissions** and select:
- **Read and write permissions**

This allows the daily Action to commit updated data files.

### 4. Run the pipeline manually on first deploy

Go to **Actions > Update Library Events Data > Run workflow** to populate `data/events.json` immediately, without waiting for the daily cron.

---

## Local development

Requires [uv](https://docs.astral.sh/uv/).

```bash
# Install dependencies
cd pipeline
uv sync

# Run the pipeline locally
uv run fetch_events.py
```

To preview the frontend locally you need a simple HTTP server (opening `index.html` directly as a file will fail due to the `fetch()` call):

```bash
# From the repo root
python3 -m http.server 8000
# Then open http://localhost:8000
```

---

## Project structure

```
/
  index.html              Single-file frontend
  data/
    events.json           Pre-processed events data (auto-updated)
    meta.json             Last update timestamp and record count
  pipeline/
    fetch_events.py       Data pipeline script
    pyproject.toml        uv project config and dependencies
    uv.lock               Lockfile (committed for reproducibility)
  .github/
    workflows/
      update_data.yml     Daily GitHub Actions workflow
```

---

## Notes

- The pipeline exits early with no commit if the upstream data has not changed since the last run, based on the `LastUpdatedOn` field.
- Only `ACTIVE` status events are included.
- Duplicate `EventID` values in the source data are deduplicated on import (first occurrence kept).
- This tool is not affiliated with or endorsed by Toronto Public Library.