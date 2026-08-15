# modpackdad.gg

Source for [modpackdad.gg](https://modpackdad.gg), a dependency-free static site built with HTML, CSS, and vanilla JavaScript. There is no framework or build step.

## Site areas

- `/` — the main ModPackDad landing page (`index.html`).
- `/launch/` — an unlinked, keyboard-driven personal start page backed by `launch/bookmarks.json`.
- `/setlists/` — Selector MPD set guides.

## Documentation

Detailed documentation currently covers the `/launch` start page:

- [Design specification](docs/superpowers/specs/2026-06-07-launch-startpage-design.md) — intended behavior, data model, interactions, accessibility, and visual design.
- [Implementation plan](docs/superpowers/plans/2026-06-08-launch-startpage.md) — historical implementation record and manual verification steps. Some sample data, counts, and local paths reflect the original implementation and may no longer match the current site.

Keep detailed design and implementation guidance in `docs/`; this README should remain a concise project index rather than duplicate those documents.

## Changes and deployment

Make changes on a dedicated branch and submit them through a pull request. Cloudflare Pages creates a site preview for each pull request; review that preview before merging. Merging to `main` deploys the production site.
