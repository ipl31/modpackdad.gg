# ModPackDad.gg project

The website is dependency-free static HTML, CSS, and JavaScript deployed by Cloudflare Pages. Start with the [README](../README.md) for docs and the PR workflow. Keep it short and link to detailed docs.

Preserve the deliberate homepage navigation. [/hardware/](../hardware/index.html) is linked from the [homepage](../index.html) and its copy should stay factual and uncluttered. [/aim/](../aim/index.html) is intentionally unpromoted there. The exact AVerMedia camera variant remains open until Ken provides it.

OBS sends the stream to Restream. [/live/](../live/index.html) uses YouTube video. See the [live implementation plan](../docs/live-implementation-plan.md) for architecture and the [live-worker README](../live-worker/README.md) for the separately deployed Worker and its operational checks.

Choose checks for the actual changes. Serve the static files locally and render affected routes for UI changes. Use the README's Python unit tests for aim refresh changes and the Worker README's checks for Worker changes. Verify the actual Pages preview and public result when publishing is in scope.
