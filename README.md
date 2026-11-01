# modpackdad.gg

Source for [modpackdad.gg](https://modpackdad.gg), a dependency-free static site built with HTML, CSS, and vanilla JavaScript. There is no framework or build step.

## Site areas

- `/` — the main ModPackDad landing page (`index.html`).
- `/live/` — the ModPackDad YouTube livestream, status, and combined chat experience.
- `/mpd-bot/` — the MPD Bot product and download landing page.
- `/mpd-viewer/` — the MPD Viewer product and landing page.
- `/ai-editing/` — my AI editing agent package and skills, shared because people asked, with the downloadable Short Video Starter ZIP.
- `/aim/` — daily aim routine and scenario score medians.
- `/aim/voltaic/` — Voltaic Season 5.5 Novice rank, skill profile, and scenario thresholds. Refresh the public snapshot with `python3 scripts/refresh-voltaic.py`; the page labels when it was captured and links to EVXL for live results.
- `/launch/` — an unlinked, keyboard-driven personal start page backed by `launch/bookmarks.json`.
- `/setlists/` — Selector MPD set guides.

## Documentation

Detailed documentation currently covers the `/launch` start page:

- [Design specification](docs/superpowers/specs/2026-06-07-launch-startpage-design.md) — intended behavior, data model, interactions, accessibility, and visual design.
- [Implementation plan](docs/superpowers/plans/2026-06-08-launch-startpage.md) — historical implementation record and manual verification steps. Some sample data, counts, and local paths reflect the original implementation and may no longer match the current site.
- [`/live` implementation plan](docs/live-implementation-plan.md) — architecture, provider decisions, security model, and production prerequisites for the live experience.

Keep detailed design and implementation guidance in `docs/`; this README should remain a concise project index rather than duplicate those documents.

The Voltaic view uses a committed snapshot rather than calling third-party APIs from visitors' browsers. Run `python3 scripts/refresh-voltaic.py` to update it from EVXL and KovaaK's public endpoints. The refresh validates the player, benchmark, score units, rank thresholds, and scenario count before replacing the JSON. Run `python3 -m unittest discover -s scripts -p 'test_*.py'` for the rank calculation checks. Publish snapshot updates through the usual pull request workflow.

## Changes and deployment

Make changes on a dedicated branch and submit them through a pull request. Cloudflare Pages creates a site preview for each pull request; review that preview before merging. Merging to `main` deploys the production site.
