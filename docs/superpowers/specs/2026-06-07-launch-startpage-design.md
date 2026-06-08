# Personal browser start page — `/launch`

A hand-curated, terminal-aesthetic browser start page that lives at `modpackdad.gg/launch/`,
unlinked from the main site. Categorised bookmarks, name-only display, keyboard-driven filter.

## Purpose

A page Ken opens many times a day as the browser homepage / new-tab URL. Starts with ~50
bookmarks across a handful of categories, expected to grow into the hundreds over time.
Must remain readable and fast to scan as it grows.

## Scope

**In scope (v1):**
- Static page at `modpackdad.gg/launch/` reading bookmarks from `modpackdad.gg/launch/bookmarks.json`
- Categorised display, all categories visible at once
- Live filter input (`/` to focus, type to filter, `Enter` opens top match, `Esc` clears)
- Console / terminal aesthetic (dark, JetBrains Mono, amber accent, faint CRT atmosphere)
- Optional per-link icon (1–2 character text or emoji)

**Out of scope (v1):**
- In-browser editing of bookmarks (data is hand-edited JSON)
- Pinned / favourites / tags / cross-cutting filters
- Vim-style `j`/`k` navigation, number-key quick-open, help overlay (`?`)
- Settings, theme toggle, recent-visit history
- Favicon URLs as icon values (`icon` is text/emoji only)
- Drag-to-reorder
- Linked from the main `modpackdad.gg` site

## Architecture

Single static page, vanilla HTML/CSS/JS, no build step, no framework, no dependencies.

```
modpackdad.gg/
  launch/
    index.html      ← markup + inline CSS + inline JS (~150 LOC)
    bookmarks.json  ← hand-edited data
```

Lives inside the existing `modpackdad.gg` repository (`github.com:ipl31/modpackdad.gg`).
Deployment uses whatever pipeline is already deploying the main site — adding files in the
repo will deploy them at the corresponding path. No new infrastructure.

The page fetches `bookmarks.json` on load (relative URL: `./bookmarks.json`) and renders the
grid into the DOM once. No re-fetch, no polling. Refresh the tab to pick up edits.

## Data model

`bookmarks.json` is a single object containing an ordered list of categories, each with an
ordered list of links. File ordering = page ordering.

```json
{
  "categories": [
    {
      "name": "dev",
      "links": [
        { "name": "GitHub", "url": "https://github.com", "icon": "🐙" },
        { "name": "Vercel", "url": "https://vercel.com" },
        { "name": "MDN",    "url": "https://developer.mozilla.org", "icon": "📘" }
      ]
    },
    {
      "name": "read",
      "links": [
        { "name": "Hacker News", "url": "https://news.ycombinator.com" }
      ]
    }
  ]
}
```

### Field reference

| Path | Type | Required | Notes |
|---|---|---|---|
| `categories` | array | yes | Ordered. May be empty (renders empty state). |
| `categories[].name` | string | yes | Displayed as the category heading. Lowercase is conventional but not enforced. |
| `categories[].links` | array | yes | Ordered. May be empty (the category is omitted from render). |
| `categories[].links[].name` | string | yes | What appears in the grid. |
| `categories[].links[].url` | string | yes | Where the link points. Never displayed in the UI. |
| `categories[].links[].icon` | string | no | 1–2 characters: emoji or text symbol. If absent, the icon column is blank but space is reserved for alignment. URLs are not accepted in v1. |

### Rendering rules

- A category with zero links is omitted entirely (header + body both hidden).
- Empty `categories` array → empty-state message.
- Failure to fetch or parse `bookmarks.json` → error-state message.
- Icon column reserves ~16px regardless of icon presence so link names left-align cleanly
  within a column.

## Layout

A CSS multi-column flow. The viewport width determines the column count; categories pack
vertically inside columns and avoid breaking across them.

```css
.grid {
  column-width: 240px;
  column-gap: 32px;
  column-fill: balance;
}
.category { break-inside: avoid; margin-bottom: 24px; }
```

Result: ~3 columns at narrow desktop, 4 at typical, 5+ on wide screens — no manual
breakpoints needed.

### Page structure

```
┌─────────────────────────────────────────────────────────┐
│ ken@home:~/launch  N links · N cats         / filter ▌  │  ← banner
├─────────────────────────────────────────────────────────┤
│                                                          │
│  DEV ─── 12       READ ─── 08       WORK ─── 07         │
│  🐙 GitHub        🔶 Hacker News    🟣 Linear            │
│  ▲  Vercel           Lobsters       📝 Notion            │
│  …                 …                 …                   │
│                                                          │
│  AI ─── 04        MEDIA ─── 05      LIFE ─── 06         │
│  …                 …                 …                   │
└─────────────────────────────────────────────────────────┘
```

### HTML skeleton

```html
<header class="banner">
  <div class="prompt">
    <span class="user">ken@home</span><span class="path">:~/launch</span>
    <span class="meta"><span data-link-count>0</span> links · <span data-cat-count>0</span> categories</span>
  </div>
  <div class="filter">
    <span class="sigil">/</span>
    <input id="filter" type="text" aria-label="filter bookmarks" autocomplete="off">
  </div>
</header>
<main id="grid" class="grid" aria-live="polite"></main>
<div id="msg" class="msg" role="status"></div>
```

Each rendered category:

```html
<section class="category" data-cat="dev">
  <h2 class="cat-h"><span class="cat-name">dev</span><span class="cat-rule"></span><span class="cat-count">12</span></h2>
  <ul class="links">
    <li><a class="link" href="https://github.com" data-name="GitHub" data-cat="dev">
      <span class="icon">🐙</span><span class="name">GitHub</span>
    </a></li>
    <!-- … -->
  </ul>
</section>
```

## Visual tokens

Defined as CSS custom properties on `:root` so they're easy to tweak.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0d10` | Page background |
| `--ink` | `#e6edf3` | Link names |
| `--ink-dim` | `#cdd9e5` | Secondary body text |
| `--mute` | `#6e7681` | Category counts, prompt path, helper text |
| `--accent` | `#ffb000` | Category headings, prompt sigil, cursor, filter focus, top-match marker |
| `--user` | `#4ec9b0` | `ken@home` username segment in the prompt |
| `--err` | `#f47174` | Error message colour |
| `--font` | `'JetBrains Mono', ui-monospace, monospace` | Everything |

### Atmosphere

```css
body::before {
  content: "";
  position: fixed; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse at 80% -10%, rgba(255,176,0,0.05), transparent 60%),
    repeating-linear-gradient(0deg, transparent 0, transparent 2px,
                              rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 3px);
}
```

A radial amber bloom in the top-right corner and a subtle scanline overlay (1.2% alpha) —
adds CRT warmth without becoming kitsch.

### Typography

- **Prompt banner**: 12 px mono. `ken@home` in `--user`, `:~/launch` in `--mute`, count meta in `--mute`.
- **Category heading**: 11 px mono, **uppercase**, 0.18 em letter-spacing, `--accent`.
  Followed by a thin rule fading right (`linear-gradient(to right, rgba(accent,0.25), transparent)`)
  and the count in `--mute`.
- **Link name**: 13 px mono, `--ink`.
- **Icon column**: ~16 px wide, left of name, one character cell.
- **Filter input**: 12 px mono, `--ink-dim`, transparent background, no border (just the leading `/` sigil and blinking cursor).

JetBrains Mono is loaded via Google Fonts with `display=swap` to avoid blocking render.

## Interactions

### Filter

| Key | Action |
|---|---|
| `/` (anywhere on page) | Focus the filter input |
| Any character | Live update of the filter (no debounce) |
| `Enter` | Open the top remaining match in the same tab |
| `Esc` | Clear the filter and blur the input |

**Matching:**
- Case-insensitive substring match.
- A link is kept visible if the filter substring appears in **either** its `name` **or** its
  containing category's `name`.
- A category whose every link is hidden is itself hidden.
- The matched substring inside each link name is highlighted with `--accent` (no underline).
- The first remaining link in document order gets a leading `›` glyph in `--accent` so the
  user can see what `Enter` will open.
- Category-header counts switch to show the visible count (e.g. `2 matches`) in `--accent`.

**Banner-vs-category counts:**
- The top **banner** counts (`N links · N categories`) show the **totals from the data** and
  do not change when the filter is active — they describe the dataset, not the view.
- The **category-header** counts show **what is currently visible** in that category and do
  update with the filter. The two scopes do not conflict because they describe different
  things; the visual distinction reinforces it (banner = mute grey, active-filter category
  counts = amber).

### Click behaviour

A link click opens in the **same tab**. The start page is the navigation surface; clicking
*is* the navigation. (Cmd/Ctrl-click for new tab works automatically via default anchor
behaviour.)

### Focus behaviour on load

The filter input is **not** auto-focused. The user can scroll, hover, and Cmd-click freely.
A single `/` keypress is one keystroke away from typing.

### Accessibility

- Filter input has `aria-label="filter bookmarks"`.
- The grid container is `aria-live="polite"` so screen readers announce result changes.
- Error and empty-state messages live in a `role="status"` element.
- Native focus rings are preserved on the filter and on links.

## States

| State | Trigger | Display |
|---|---|---|
| Loading | Fetch in flight | Banner visible; grid is blank. Typical fetch is <50 ms locally so no spinner needed. |
| Empty data | Successful fetch, `categories` is empty or all categories have empty `links` | Centred message: `no links yet — edit bookmarks.json` in `--mute` |
| Fetch / parse error | `bookmarks.json` 4xx / 5xx / invalid JSON | Centred message: `failed to load bookmarks.json` in `--err`, with the underlying error message smaller below it |
| Filter with no matches | Filter active, every link hidden | Centred message: `no matches for "xyz" — esc to clear` in `--accent` |

## File layout

```
modpackdad.gg/
  launch/
    index.html      ← all markup, CSS, and JS in one file
    bookmarks.json  ← hand-edited
```

`index.html` is fully self-contained: no external script files, no CSS files. Only external
resource is the Google Fonts request for JetBrains Mono.

## Out of scope for v1 (capture for future)

- In-browser editing UI for adding/reordering bookmarks
- Pinned bookmarks bubbling up to a top "frequent" section
- Tags / cross-category filtering
- Favicon URLs as `icon` values (`<img>` rendering)
- Vim-style `j`/`k` navigation
- Number-key quick-open (`⌘1-9`)
- Help overlay (`?`)
- Settings / theme toggle
- Recent-visit history or click counters
- Drag-to-reorder
- Linking from the main `modpackdad.gg` site

## Open assumptions to validate during implementation

- The existing deployment for `modpackdad.gg` will pick up files under `launch/` without
  configuration changes. If not, deployment may need a one-time tweak — call out at the
  implementation-plan stage.
- The `bookmarks.json` will be small enough (50–500 links) that no virtualisation or
  pagination is needed. If it grows past a few thousand entries this may need revisiting.
