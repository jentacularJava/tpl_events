# TPL Events Finder

A community-built tool to search and filter Toronto Public Library branch programs and events.

Data is sourced from [Toronto Open Data](https://open.toronto.ca/dataset/library-branch-programs-and-events-feed/) and refreshed daily via GitHub Actions.

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
