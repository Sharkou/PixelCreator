# Documentation website

`docs/` is the canonical documentation and it is **readable directly on GitHub**. That is not a
fallback — it is the requirement. Any website is an additional rendering of the same files, and
nothing in this folder may depend on a site generator to make sense.

## Current state

**No GitHub Pages site is configured, and nothing in the repository turns one on.** This is a
deliberate stopping point rather than an oversight: the two decisions a site needs — *is Pages
enabled, and on what* — live in GitHub's repository settings, not in a file, and enabling Pages
with an unverified Jekyll configuration is a good way to publish a broken site.

Every relative link in `docs/` resolves as a file path, which means it works:

- browsing the repository on GitHub;
- in a fork, unchanged;
- in a local clone, in any Markdown viewer;
- and under a branch-based Pages deployment, which serves the same paths.

## Recommended next step

The smallest setup that publishes this folder cleanly, with **no framework and no dependency**:

### 1. Enable Pages from the `docs/` folder

In the repository's **Settings ▸ Pages**:

| Setting | Value |
|---|---|
| Source | *Deploy from a branch* |
| Branch | `master` |
| Folder | `/docs` |

GitHub then builds the folder with its own Jekyll and its default theme. Markdown renders,
relative links between `.md` files are rewritten, and `docs/README.md` becomes the index page.
Nothing needs to be added to the repository for this to work.

### 2. Verify, then adjust

Once it is live, check these specifically — they are what a Jekyll build changes:

- `docs/README.md` renders as the site root;
- links between pages resolve (Jekyll rewrites `.md` links; deep relative paths such as
  `../decisions/ADR-0027-...md` are the ones to check first);
- nothing in `docs/` is being interpreted as Liquid template syntax. A literal `{{` or `{%` in a
  Markdown file would be, and would fail the build — a repository-wide `grep` before enabling is
  cheap:
  ```bash
  grep -rn '{{\|{%' docs/
  ```
- the ADR filenames survive: they are long, and they contain no characters Jekyll objects to.

If any of that misbehaves, add a minimal `docs/_config.yml` — a theme and nothing else — rather
than reaching for a documentation framework.

### 3. Custom domain (optional)

To serve it at `docs.pixelcreator.io`:

1. Add a DNS `CNAME` record for `docs` pointing at `sharkou.github.io`.
2. Enter `docs.pixelcreator.io` in **Settings ▸ Pages ▸ Custom domain**. GitHub writes a
   `CNAME` file into the published branch itself; you do not create it by hand.
3. Wait for the certificate, then tick **Enforce HTTPS**.
4. Add the link to the repository's **About** panel and to the root
   [README](../../README.md).

## What not to do

| Do not | Why |
|---|---|
| Add MkDocs, Docusaurus, VitePress, Sphinx… | A documentation framework would add a build step and a dependency tree to a project whose central constraint is having neither. It would also make the docs unreadable without it |
| Add `.nojekyll` | On a branch-based deployment that turns Markdown rendering **off** and serves raw files |
| Maintain a second copy of the documentation | Including the GitHub Wiki. One source, rendered in more than one place — never two sources |
| Restructure `docs/` to suit a generator | The folder is organised for readers and for `git`, in that order |

## The Wiki

The repository's GitHub Wiki predates this documentation and was previously presented in the
README as *the* documentation. It is no longer the source of truth.

The recommended action is to point the Wiki's front page at `docs/` — one paragraph and a link —
rather than delete it: existing links to it, from Discord and from the website, keep working.
Leaving it with stale content while `docs/` says something else is the one outcome to avoid.

That is a maintainer action in GitHub's own interface; no file in this repository can do it.
