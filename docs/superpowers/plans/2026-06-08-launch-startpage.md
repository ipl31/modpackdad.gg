# /launch Start Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal browser start page at `modpackdad.gg/launch/` — terminal-aesthetic, hand-edited categorised bookmarks, keyboard-driven filter.

**Architecture:** Single static `index.html` (markup + inline CSS + inline JS, ~250 LOC) reading a sibling `bookmarks.json`. No build, no framework, no dependencies. Drops into the existing `modpackdad.gg` repository under `launch/`; existing deploy pipeline picks it up. Unlinked from main site.

**Tech Stack:** Vanilla HTML / CSS / JS. JetBrains Mono via Google Fonts. Brave for manual browser verification.

**Spec:** `docs/superpowers/specs/2026-06-07-launch-startpage-design.md`

**Reference:** `Repo root: /Users/ken/dev/personal/modpackdad.gg` — all file paths in this plan are relative to it unless otherwise specified.

**Testing note:** Spec deliberately disallows a build step or test framework. Each task ends with a **manual browser verification step** describing exactly what to look at and what to expect.

---

## Task 1: Scaffold `launch/` with sample data and skeleton page

Get the directory in place with realistic sample data and a skeleton page that loads JetBrains Mono, applies CSS variables and atmosphere, and renders the prompt banner with link/category counts pulled from JSON. The grid area is wired up but empty — the next task fills it.

**Files:**
- Create: `launch/bookmarks.json`
- Create: `launch/index.html`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p launch
```

- [ ] **Step 2: Write `launch/bookmarks.json` with sample content**

Use this as the starting dataset. The user will customise it later — keep this content as-is for v1.

```json
{
  "categories": [
    {
      "name": "dev",
      "links": [
        { "name": "GitHub",         "url": "https://github.com",                "icon": "🐙" },
        { "name": "Vercel",         "url": "https://vercel.com",                "icon": "▲"  },
        { "name": "MDN",            "url": "https://developer.mozilla.org",     "icon": "📘" },
        { "name": "Stack Overflow", "url": "https://stackoverflow.com" },
        { "name": "npm",            "url": "https://www.npmjs.com",             "icon": "📦" },
        { "name": "Can I Use",      "url": "https://caniuse.com" },
        { "name": "Regex101",       "url": "https://regex101.com" },
        { "name": "Excalidraw",     "url": "https://excalidraw.com" }
      ]
    },
    {
      "name": "read",
      "links": [
        { "name": "Hacker News",     "url": "https://news.ycombinator.com",     "icon": "🔶" },
        { "name": "Lobsters",        "url": "https://lobste.rs" },
        { "name": "Are.na",          "url": "https://are.na" },
        { "name": "The Browser",     "url": "https://thebrowser.com" },
        { "name": "Aeon",            "url": "https://aeon.co" },
        { "name": "Daring Fireball", "url": "https://daringfireball.net" },
        { "name": "The Verge",       "url": "https://www.theverge.com" }
      ]
    },
    {
      "name": "work",
      "links": [
        { "name": "Linear",     "url": "https://linear.app",          "icon": "🟣" },
        { "name": "Notion",     "url": "https://www.notion.so",       "icon": "📝" },
        { "name": "Slack",      "url": "https://slack.com" },
        { "name": "Calendar",   "url": "https://calendar.google.com" },
        { "name": "Gmail",      "url": "https://mail.google.com" },
        { "name": "Figma",      "url": "https://www.figma.com" },
        { "name": "1Password",  "url": "https://1password.com" }
      ]
    },
    {
      "name": "ai",
      "links": [
        { "name": "Claude",             "url": "https://claude.ai",         "icon": "✦" },
        { "name": "ChatGPT",            "url": "https://chat.openai.com" },
        { "name": "Anthropic Console",  "url": "https://console.anthropic.com" },
        { "name": "Cursor",             "url": "https://cursor.sh" }
      ]
    },
    {
      "name": "media",
      "links": [
        { "name": "YouTube",    "url": "https://www.youtube.com" },
        { "name": "Spotify",    "url": "https://open.spotify.com" },
        { "name": "Letterboxd", "url": "https://letterboxd.com" },
        { "name": "Bandcamp",   "url": "https://bandcamp.com" }
      ]
    }
  ]
}
```

- [ ] **Step 3: Write `launch/index.html` with skeleton, CSS variables, atmosphere, and banner**

Everything in this step is foundational and used by all later tasks. Don't trim.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>launch</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0d10;
      --ink: #e6edf3;
      --ink-dim: #cdd9e5;
      --mute: #6e7681;
      --accent: #ffb000;
      --user: #4ec9b0;
      --err: #f47174;
      --font: 'JetBrains Mono', ui-monospace, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: var(--bg);
      color: var(--ink-dim);
      font-family: var(--font);
      min-height: 100vh;
    }

    /* CRT atmosphere: faint scanlines + amber bloom in top-right */
    body::before {
      content: "";
      position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background:
        radial-gradient(ellipse at 80% -10%, rgba(255, 176, 0, 0.05), transparent 60%),
        repeating-linear-gradient(0deg, transparent 0, transparent 2px,
                                  rgba(255, 255, 255, 0.012) 2px, rgba(255, 255, 255, 0.012) 3px);
    }
    body > * { position: relative; z-index: 1; }

    .banner {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 22px 36px 18px;
      font-size: 12px;
      color: var(--mute);
      flex-wrap: wrap;
      gap: 12px;
    }
    .prompt { display: flex; gap: 14px; align-items: baseline; }
    .prompt .user { color: var(--user); font-weight: 600; }
    .prompt .path { color: var(--mute); }
    .prompt .meta { color: var(--mute); }

    .grid { padding: 6px 36px 36px; }

    .msg {
      padding: 32px 36px;
      text-align: center;
      font-size: 13px;
      color: var(--mute);
    }
  </style>
</head>
<body>
  <header class="banner">
    <div class="prompt">
      <span><span class="user">ken@home</span><span class="path">:~/launch</span></span>
      <span class="meta"><span id="link-count">0</span> links · <span id="cat-count">0</span> categories</span>
    </div>
    <!-- filter input added in Task 3 -->
  </header>
  <main id="grid" class="grid" aria-live="polite"></main>
  <div id="msg" class="msg" role="status"></div>

  <script>
    (async () => {
      try {
        const res = await fetch('./bookmarks.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const totalLinks = data.categories.reduce((n, c) => n + (c.links?.length || 0), 0);
        const totalCats = data.categories.filter(c => c.links?.length > 0).length;
        document.getElementById('link-count').textContent = totalLinks;
        document.getElementById('cat-count').textContent = totalCats;
      } catch (e) {
        console.error('failed to load bookmarks.json', e);
        document.getElementById('msg').textContent = 'failed to load bookmarks.json';
        document.getElementById('msg').style.color = 'var(--err)';
      }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 4: Manual verification in Brave**

The page is a static file with `fetch('./bookmarks.json')`, so it needs an HTTP server — `file://` will hit a CORS error. Start a one-liner Python server from the repo root and open the page:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory . &
# remember the PID so you can kill it later
open -a "Brave Browser" "http://127.0.0.1:8765/launch/"
```

Expected to see:
- Dark background, very faint amber glow in the top-right corner, barely-visible horizontal scanlines.
- Top-left of page: `ken@home:~/launch` with `ken@home` in teal-green, `:~/launch` in grey.
- Right of that: `30 links · 5 categories` in grey.
- Empty space below the banner — the grid renders in Task 2.
- Font is JetBrains Mono (rounded-square, monospace). If you see a system font, the Google Fonts request failed — check your network or the `<link>` tag.

If something looks off, fix before committing.

- [ ] **Step 5: Stop the local server**

```bash
# find and kill the python http.server you started
lsof -ti tcp:8765 | xargs -r kill
```

- [ ] **Step 6: Commit**

```bash
git add launch/bookmarks.json launch/index.html
git commit -m "Scaffold /launch with sample bookmarks and banner"
```

---

## Task 2: Render bookmark grid and add hover state

Replace the stub bootstrap with real render logic. CSS multi-column flow lays out categories; each category is a header with rule + count and a list of links with optional icons. Hover/focus brightens the link name.

**Files:**
- Modify: `launch/index.html`

- [ ] **Step 1: Add grid, category, and link CSS**

Insert these rules into the `<style>` block, after the `.msg` rule:

```css
.grid {
  column-width: 240px;
  column-gap: 32px;
  column-fill: balance;
}

.category {
  break-inside: avoid;
  margin-bottom: 24px;
}

.cat-h {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--accent);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 8px;
}
.cat-h .rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, rgba(255, 176, 0, 0.25), transparent);
}
.cat-h .count {
  font-size: 9.5px;
  color: var(--mute);
  letter-spacing: 0;
  font-weight: 600;
}

.links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.link {
  color: var(--ink);
  text-decoration: none;
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 1.5px 0;
  font-size: 13px;
  line-height: 1.5;
  transition: color 0.12s ease;
}
.link .marker {
  width: 10px;
  flex-shrink: 0;
  color: var(--accent);
  font-weight: 700;
}
.link .icon {
  width: 16px;
  flex-shrink: 0;
  text-align: left;
}
.link .name { color: var(--ink); }

.link:hover .name,
.link:focus-visible .name { color: #ffffff; }
.link:hover .icon,
.link:focus-visible .icon { color: var(--accent); }
```

- [ ] **Step 2: Replace the bootstrap `<script>` with real render logic**

Replace the existing `<script>...</script>` block with the following. This adds `renderGrid()` which builds DOM nodes for each category and link, sets `data-name` / `data-cat` attributes (used by the filter in later tasks), and updates the banner counts.

```html
<script>
  function escapeText(s) {
    // Defence in depth — bookmarks.json is hand-edited but treating it as untrusted is cheap.
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderGrid(data) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    let totalLinks = 0;
    let renderedCats = 0;

    for (const cat of data.categories) {
      if (!cat.links?.length) continue;
      renderedCats++;
      totalLinks += cat.links.length;

      const section = document.createElement('section');
      section.className = 'category';
      section.dataset.cat = cat.name;
      section.innerHTML =
        '<h2 class="cat-h">' +
          '<span class="cat-name">' + escapeText(cat.name) + '</span>' +
          '<span class="rule"></span>' +
          '<span class="count">' + cat.links.length + '</span>' +
        '</h2>' +
        '<ul class="links"></ul>';

      const ul = section.querySelector('.links');
      for (const link of cat.links) {
        const li = document.createElement('li');
        const iconCell = link.icon
          ? '<span class="icon">' + escapeText(link.icon) + '</span>'
          : '<span class="icon"></span>';
        li.innerHTML =
          '<a class="link" href="' + escapeText(link.url) + '"' +
          ' data-name="' + escapeText(link.name) + '"' +
          ' data-cat="' + escapeText(cat.name) + '">' +
            '<span class="marker"></span>' +
            iconCell +
            '<span class="name">' + escapeText(link.name) + '</span>' +
          '</a>';
        ul.appendChild(li);
      }
      grid.appendChild(section);
    }

    document.getElementById('link-count').textContent = totalLinks;
    document.getElementById('cat-count').textContent = renderedCats;
  }

  async function load() {
    const msg = document.getElementById('msg');
    try {
      const res = await fetch('./bookmarks.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderGrid(data);
    } catch (e) {
      console.error('failed to load bookmarks.json', e);
      msg.textContent = 'failed to load bookmarks.json';
      msg.style.color = 'var(--err)';
    }
  }
  load();
</script>
```

- [ ] **Step 3: Manual verification in Brave**

Start the dev server and reload the page:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory . &
open -a "Brave Browser" "http://127.0.0.1:8765/launch/"
```

Expected to see:
- Banner unchanged at top: `ken@home:~/launch 30 links · 5 categories`.
- Below it: 5 category blocks (`DEV`, `READ`, `WORK`, `AI`, `MEDIA`) flowing across the available width as columns (typical desktop = 3–4 columns).
- Each category header in amber, uppercase, with a fading rule to its right and a small grey count.
- Each link is a row with an optional emoji icon (🐙, ▲, 📘 etc. on some, blank space on others) followed by the link name in off-white.
- Hover over any link: the name brightens to pure white and the icon turns amber. Pointer should be a hand (default for `<a>`).
- Click any link: navigates in the same tab to the destination.
- Resize the browser window narrower / wider: number of columns adapts automatically with no layout breakage.

If categories overlap or icons mis-align, fix before committing.

- [ ] **Step 4: Stop the local server**

```bash
lsof -ti tcp:8765 | xargs -r kill
```

- [ ] **Step 5: Commit**

```bash
git add launch/index.html
git commit -m "Render bookmark grid from bookmarks.json"
```

---

## Task 3: Filter input + keyboard plumbing

Add the filter input to the banner with a leading `/` sigil and a blinking caret style. Wire up the keyboard shortcuts (`/` focuses the input, `Esc` blurs it and clears it). The input doesn't actually filter the grid yet — that's the next task. Focus and state plumbing is enough for one commit.

**Files:**
- Modify: `launch/index.html`

- [ ] **Step 1: Add filter CSS**

Insert into the `<style>` block, after the `.link` rules:

```css
.filter {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(110, 118, 129, 0.3);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--mute);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.filter:focus-within {
  border-color: var(--accent);
  background: rgba(255, 176, 0, 0.04);
}
.filter .sigil {
  color: var(--accent);
  font-weight: 700;
}
.filter input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--ink-dim);
  font-family: var(--font);
  font-size: 12px;
  width: 140px;
  padding: 0;
}
.filter input::placeholder {
  color: var(--mute);
}
```

- [ ] **Step 2: Add the filter input to the banner**

In the `<header class="banner">` block, replace the line `<!-- filter input added in Task 3 -->` with:

```html
<div class="filter">
  <span class="sigil">/</span>
  <input id="filter-input" type="text" aria-label="filter bookmarks" autocomplete="off" placeholder="filter">
</div>
```

- [ ] **Step 3: Add the keyboard shortcuts**

Add this function to the `<script>` block, then call it at the bottom of the script alongside `load()`:

```javascript
function wireKeyboard() {
  const input = document.getElementById('filter-input');
  document.addEventListener('keydown', (e) => {
    const focused = document.activeElement === input;
    if (e.key === '/' && !focused) {
      // user pressed `/` outside the input — focus it without the slash being typed
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === 'Escape' && focused) {
      e.preventDefault();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    }
  });
}
```

Then change the script's bottom from `load();` to:

```javascript
load();
wireKeyboard();
```

- [ ] **Step 4: Manual verification in Brave**

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory . &
open -a "Brave Browser" "http://127.0.0.1:8765/launch/"
```

Expected to see and try:
- A small bordered box in the banner's right side reading `/  filter` (placeholder).
- Click anywhere outside the filter input first to make sure the page itself has focus, **not** the input.
- Press `/`: the input gets focus, the border turns amber, the background tints amber faintly. The `/` character is NOT typed into the input.
- Type a few characters: they appear in the input. The grid does not yet react — expected.
- Press `Esc`: input clears, blurs, border returns to grey.
- Press `/` again, type a letter, press `Esc`: same clear-and-blur behaviour.

If pressing `/` types `/` into the input or doesn't focus, the `preventDefault` and focus order is wrong — fix.

- [ ] **Step 5: Stop the local server**

```bash
lsof -ti tcp:8765 | xargs -r kill
```

- [ ] **Step 6: Commit**

```bash
git add launch/index.html
git commit -m "Add filter input with / focus and Esc clear"
```

---

## Task 4: Live substring filter logic

Wire the filter input to actually filter the grid. Substring (case-insensitive) match against the link name **or** its containing category's name. Hide non-matching links. Hide categories whose links are all hidden. Update each visible category's count to `N matches` / `1 match` in amber. No highlighting or top-match marker yet — that's Task 5.

**Files:**
- Modify: `launch/index.html`

- [ ] **Step 1: Add the filter-state CSS**

Insert into the `<style>` block, after the `.filter` rules:

```css
.cat-h .count.match-count {
  color: var(--accent);
  font-size: 9.5px;
  text-transform: lowercase;
  letter-spacing: 0;
}
```

- [ ] **Step 2: Build the filter index after render**

In `renderGrid()`, add the following at the very end of the function — after the two `document.getElementById('link-count' / 'cat-count').textContent = ...` lines, just before the closing `}` of `renderGrid`. This saves a flat index of categories and links that the filter will use:

```javascript
    // build filter index for use by applyFilter()
    window.__filterIndex = [...grid.querySelectorAll('.category')].map(section => {
      const links = [...section.querySelectorAll('.link')].map(a => ({
        el: a,
        name: a.dataset.name,
        cat: a.dataset.cat,
      }));
      return {
        section,
        countEl: section.querySelector('.cat-h .count'),
        originalCount: links.length,
        name: section.dataset.cat,
        links,
      };
    });
```

- [ ] **Step 3: Add the `applyFilter()` function**

Add this function to the `<script>` block (above `wireKeyboard`):

```javascript
function applyFilter(query) {
  const q = query.trim().toLowerCase();
  const index = window.__filterIndex || [];

  if (!q) {
    // reset: show everything, restore counts
    for (const cat of index) {
      cat.section.style.display = '';
      for (const item of cat.links) item.el.style.display = '';
      cat.countEl.textContent = cat.originalCount;
      cat.countEl.classList.remove('match-count');
    }
    return;
  }

  for (const cat of index) {
    const catMatches = cat.name.toLowerCase().includes(q);
    let visibleInCat = 0;

    for (const item of cat.links) {
      const nameMatches = item.name.toLowerCase().includes(q);
      const visible = nameMatches || catMatches;
      item.el.style.display = visible ? '' : 'none';
      if (visible) visibleInCat++;
    }

    if (visibleInCat === 0) {
      cat.section.style.display = 'none';
    } else {
      cat.section.style.display = '';
      cat.countEl.textContent = visibleInCat === 1 ? '1 match' : visibleInCat + ' matches';
      cat.countEl.classList.add('match-count');
    }
  }
}
```

- [ ] **Step 4: Wire the input event**

In `wireKeyboard()`, add an `input` listener at the top (before the `document.addEventListener` line):

```javascript
function wireKeyboard() {
  const input = document.getElementById('filter-input');

  input.addEventListener('input', () => applyFilter(input.value));

  document.addEventListener('keydown', (e) => {
    const focused = document.activeElement === input;
    if (e.key === '/' && !focused) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === 'Escape' && focused) {
      e.preventDefault();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    }
  });
}
```

- [ ] **Step 5: Manual verification in Brave**

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory . &
open -a "Brave Browser" "http://127.0.0.1:8765/launch/"
```

Expected to see and try:
- Press `/`, type `lin`. Filter shows: `Linear` (Work) and nothing else from non-matching categories. The `WORK` category header reads `1 match` in amber.
- Press `Esc`. Everything returns: all 5 categories visible, original counts in grey.
- Press `/`, type `dev`. Because `dev` matches the category name, **all dev links** stay visible. Other categories disappear. Header reads `8 matches` in amber.
- Type `aaaaaa`. No matches — every category is hidden, the grid area is empty. (The empty-state message lands in Task 6.)
- Backspace until input is empty. Everything returns.

- [ ] **Step 6: Stop the local server**

```bash
lsof -ti tcp:8765 | xargs -r kill
```

- [ ] **Step 7: Commit**

```bash
git add launch/index.html
git commit -m "Implement live substring filter across bookmarks and categories"
```

---

## Task 5: Match highlighting + top-match marker

Add visual feedback inside the filter: the matched substring inside a link name renders in amber, and the first remaining link in document order gets a leading `›` glyph so the user can see what `Enter` will open. (Enter behaviour lands in Task 6 — this task is visual only.)

**Files:**
- Modify: `launch/index.html`

- [ ] **Step 1: Add highlight + marker CSS**

Insert into the `<style>` block, after the `.cat-h .count.match-count` rule:

```css
.link .name mark {
  background: transparent;
  color: var(--accent);
  font-weight: 600;
}

.link.top-match .marker::before {
  content: "›";
}
```

- [ ] **Step 2: Highlight the match inside link names**

Update `applyFilter()` to rewrite each visible link's `.name` element. Replace the inner loop body inside the `for (const item of cat.links)` block with:

```javascript
    for (const item of cat.links) {
      const nameLower = item.name.toLowerCase();
      const nameMatches = nameLower.includes(q);
      const visible = nameMatches || catMatches;

      item.el.style.display = visible ? '' : 'none';
      const nameEl = item.el.querySelector('.name');

      if (visible && nameMatches) {
        const idx = nameLower.indexOf(q);
        nameEl.innerHTML =
          escapeText(item.name.slice(0, idx)) +
          '<mark>' + escapeText(item.name.slice(idx, idx + q.length)) + '</mark>' +
          escapeText(item.name.slice(idx + q.length));
      } else {
        nameEl.textContent = item.name;
      }

      if (visible) visibleInCat++;
    }
```

Also update the reset branch (where `!q`) to wipe any leftover highlight markup:

```javascript
  if (!q) {
    for (const cat of index) {
      cat.section.style.display = '';
      for (const item of cat.links) {
        item.el.style.display = '';
        item.el.querySelector('.name').textContent = item.name;
        item.el.classList.remove('top-match');
      }
      cat.countEl.textContent = cat.originalCount;
      cat.countEl.classList.remove('match-count');
    }
    return;
  }
```

- [ ] **Step 3: Mark the top match**

At the bottom of `applyFilter()` (after the for-loop over categories, before the function ends), find the first visible link and mark it. Add:

```javascript
  // clear previous top-match marker
  for (const cat of index) {
    for (const item of cat.links) item.el.classList.remove('top-match');
  }
  // mark the first remaining link in document order
  const firstVisible = document.querySelector('.link:not([style*="display: none"])');
  if (firstVisible) firstVisible.classList.add('top-match');
```

- [ ] **Step 4: Manual verification in Brave**

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory . &
open -a "Brave Browser" "http://127.0.0.1:8765/launch/"
```

Expected to see and try:
- Press `/`, type `git`. `GitHub` is the only visible link. The "git" inside `GitHub` is amber, the trailing `Hub` is white. A `›` appears to the left of the icon column.
- Backspace once → `gi`. Same link still visible, `gi` highlighted.
- Clear input. Highlight and `›` disappear.
- Type `e`. Many matches. Only the **top one** (first in document order — likely the first link of `DEV` since it's the first rendered category) has the `›` marker. Other matches still highlight `e` but no marker.
- Type `dev`. Whole DEV category shows; **none** of the link names are individually highlighted (matching is via category name, not name). The first DEV link gets the `›` marker.
- Press `Esc`. Everything resets cleanly — no leftover `<mark>` tags or markers (DevTools inspection is fine to verify).

- [ ] **Step 5: Stop the local server**

```bash
lsof -ti tcp:8765 | xargs -r kill
```

- [ ] **Step 6: Commit**

```bash
git add launch/index.html
git commit -m "Highlight filter matches and mark top match"
```

---

## Task 6: Enter-to-open + state messages

Wire `Enter` to open the top match in the same tab. Add the three message states: empty data, fetch/parse error, no-match. Each shows centred text in the appropriate colour using the existing `#msg` element.

**Files:**
- Modify: `launch/index.html`

- [ ] **Step 1: Add no-match message style**

Insert into the `<style>` block, after the `.msg` rule:

```css
.msg.nomatch { color: var(--accent); }
.msg.empty { color: var(--mute); }
.msg.err { color: var(--err); }
```

- [ ] **Step 2: Track the no-match state inside `applyFilter()`**

At the bottom of `applyFilter()` (after the top-match marker logic from Task 5), add:

```javascript
  const msg = document.getElementById('msg');
  if (firstVisible) {
    msg.textContent = '';
    msg.className = 'msg';
  } else {
    msg.textContent = 'no matches for "' + query + '" — esc to clear';
    msg.className = 'msg nomatch';
  }
```

Also clear the message inside the reset branch (`if (!q)`). Add this line just before the `return;` in that branch:

```javascript
    const msg = document.getElementById('msg');
    msg.textContent = '';
    msg.className = 'msg';
```

- [ ] **Step 3: Handle empty data and load errors**

Replace the existing `load()` function with this version, which adds the empty-data check and the styled error message:

```javascript
  async function load() {
    const msg = document.getElementById('msg');
    try {
      const res = await fetch('./bookmarks.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const hasAny = data.categories?.some(c => c.links?.length > 0);
      if (!hasAny) {
        msg.textContent = 'no links yet — edit bookmarks.json';
        msg.className = 'msg empty';
        return;
      }
      renderGrid(data);
    } catch (e) {
      console.error('failed to load bookmarks.json', e);
      msg.textContent = 'failed to load bookmarks.json';
      msg.className = 'msg err';
    }
  }
```

- [ ] **Step 4: Wire Enter to open the top match**

In `wireKeyboard()`, add the Enter branch alongside the existing `/` and `Esc` handlers. Replace the `document.addEventListener` block with:

```javascript
  document.addEventListener('keydown', (e) => {
    const focused = document.activeElement === input;
    if (e.key === '/' && !focused) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === 'Escape' && focused) {
      e.preventDefault();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    } else if (e.key === 'Enter' && focused) {
      e.preventDefault();
      const top = document.querySelector('.link.top-match');
      if (top) window.location.href = top.href;
    }
  });
```

- [ ] **Step 5: Manual verification in Brave**

Five manual checks. Start the dev server:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory . &
open -a "Brave Browser" "http://127.0.0.1:8765/launch/"
```

Check 1 — no-match state:
- Press `/`, type `zzzzzz`.
- Below the (now-empty) grid: centred amber text `no matches for "zzzzzz" — esc to clear`.
- Press `Esc`. Message disappears, grid returns.

Check 2 — Enter opens top match:
- Press `/`, type `linea`. Top match should be `Linear` with `›` marker.
- Press `Enter`. The tab navigates to `https://linear.app`.
- Hit back in the browser to return.

Check 3 — Enter does nothing when no match:
- Press `/`, type `xxxxxxx`.
- Press `Enter`. Page does not navigate (no top-match exists). Tab stays on `/launch/`.

Check 4 — empty-data state. Temporarily replace `bookmarks.json` contents with `{ "categories": [] }`:
```bash
echo '{ "categories": [] }' > launch/bookmarks.json
```
Reload the page. Expected: centred grey text `no links yet — edit bookmarks.json`. Then restore the file from git:
```bash
git checkout -- launch/bookmarks.json
```
Reload. Grid renders normally.

Check 5 — fetch error state. Temporarily rename the file:
```bash
mv launch/bookmarks.json launch/bookmarks.json.bak
```
Reload. Expected: centred red text `failed to load bookmarks.json`. Restore:
```bash
mv launch/bookmarks.json.bak launch/bookmarks.json
```
Reload. Grid renders normally.

- [ ] **Step 6: Stop the local server**

```bash
lsof -ti tcp:8765 | xargs -r kill
```

- [ ] **Step 7: Commit**

```bash
git add launch/index.html
git commit -m "Open top match on Enter; add empty and error states"
```

---

## Task 7: Final polish and cross-browser smoke test

End-to-end review. Confirm spec requirements are met, smoke-test in both Brave and Safari (since macOS ships with Safari and quirks differ from Chromium), and make any small final fixes.

**Files:**
- Modify: `launch/index.html` (only if smoke test surfaces a bug)

- [ ] **Step 1: Re-read the spec**

Open `docs/superpowers/specs/2026-06-07-launch-startpage-design.md`. For each subsection of `## Interactions` and `## States`, confirm the behaviour you observed during manual verification in earlier tasks matches what the spec describes. Note any discrepancies.

- [ ] **Step 2: Brave smoke test**

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory . &
open -a "Brave Browser" "http://127.0.0.1:8765/launch/"
```

Run through this sequence in one pass without restarting the page. Each step should "just work":

1. Page loads. Banner shows `30 links · 5 categories`. Grid renders in 3+ columns.
2. Hover a link. Name brightens to white, icon turns amber.
3. Press `/`. Input focuses, border amber.
4. Type `git`. Only `GitHub` visible; `git` highlighted amber; `›` marker on it.
5. Press `Enter`. Tab navigates to GitHub. Browser back.
6. Press `/`. Type `zzz`. No-match message in amber.
7. Press `Esc`. Clean reset.
8. Cmd-click any link. Opens in a new background tab. Tab stays on `/launch/`.
9. Shrink the window narrow (mobile-ish width, ~500px). Grid reflows to fewer columns; no horizontal scrollbar.
10. Open DevTools → Lighthouse or Performance. Page should load in well under 1 second on a normal connection.

- [ ] **Step 3: Safari smoke test**

```bash
open -a "Safari" "http://127.0.0.1:8765/launch/"
```

Run steps 1–6 from the Brave check. Safari-specific things to watch for:
- CSS `column-fill: balance` and `break-inside: avoid` should work — Safari has long-standing minor quirks but the spec uses safe properties.
- Google Fonts loads correctly (Safari occasionally has font-display issues).
- Keyboard handlers fire (`Escape` and `/` are sometimes hijacked by browser shortcuts).

If Safari behaves differently, the most likely culprit is the keyboard shortcut block — Safari may treat `/` differently than Chromium. If `/` doesn't focus the input in Safari, no fix needed for v1 (Brave is primary), but note it as a known limitation.

- [ ] **Step 4: Stop the local server**

```bash
lsof -ti tcp:8765 | xargs -r kill
```

- [ ] **Step 5: Apply any final fixes from the smoke test**

If steps 2 or 3 surfaced anything, fix it in `launch/index.html` and commit. If everything passed, skip this step.

```bash
# only if there are changes
git add launch/index.html
git commit -m "Polish /launch start page"
```

- [ ] **Step 6: Verify the final result with `git log`**

```bash
git log --oneline -10
```

Expect to see the task commits in order:

```
<hash> Polish /launch start page                                  (optional, only if Step 5 ran)
<hash> Open top match on Enter; add empty and error states
<hash> Highlight filter matches and mark top match
<hash> Implement live substring filter across bookmarks and categories
<hash> Add filter input with / focus and Esc clear
<hash> Render bookmark grid from bookmarks.json
<hash> Scaffold /launch with sample bookmarks and banner
<hash> Add /launch start-page design spec; ignore .superpowers/
```

Implementation complete. `modpackdad.gg/launch/` ready to use as a browser start page once the next site deploy fires.
