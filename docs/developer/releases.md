# Releases

Pixel Creator v2 is an **alpha under active development**. This page describes a release
process sized for that, not for a mature product.

## The primary distribution is the online editor

```
https://editor.pixelcreator.io
```

That is where users get Pixel Creator, and it is where a change reaches them. A GitHub release
is **not** how the editor is delivered; it is how a point in the repository's history is named,
so that a bug report, a changelog entry and a commit can all refer to the same thing.

## Versions

Semantic-style tags, prefixed with `v`:

```
v2.0.0-alpha.1
v2.0.0-alpha.2
v2.0.0-beta.1
v2.0.0
```

| Part | Means |
|---|---|
| **major** | An incompatible change to a saved format, or a deliberate break of a documented contract |
| **minor** | New capability, compatible |
| **patch** | Fixes only |
| **prerelease** | `-alpha.N` / `-beta.N`, while v2 is still moving |

While v2 is an alpha, **every release is marked as a prerelease on GitHub.** That is the honest
signal, and it costs nothing to stop doing later.

### Formats have their own versions

Independently of the project's version, several payloads carry a version of their own —
`FORMAT_VERSION` (scenes), `MANIFEST_VERSION` (projects), `GRAPH_VERSION`, `BUNDLE_FORMAT`,
`PREFAB_FORMAT`, `TILESET_FORMAT`, `ANIMATION_FORMAT`. A build refuses a payload from a version
it does not know, rather than misreading it.

**Bumping one of these is release-note material, every time**, because it is what decides
whether a creator's existing project still opens. A migration that reads an older shape belongs
in the same change — `Transform.migrate()` reading a pre-`rotationX` scene is the pattern.

## Cutting a release

1. **Verify.** All six checks green on the default branch
   ([Testing and verification](testing.md)).
2. **Update [CHANGELOG.md](../../CHANGELOG.md).** Move `Unreleased` entries under a new
   `[version] — date` heading and open a fresh `Unreleased` section.
3. **Tag** the commit on the default branch:
   ```bash
   git tag -a v2.0.0-alpha.1 -m "v2.0.0-alpha.1"
   git push origin v2.0.0-alpha.1
   ```
4. **Create the GitHub Release** from that tag. Mark it a prerelease while v2 is an alpha.
5. **Write the notes** (below). `.github/release.yml` gives GitHub the categories to group
   generated notes into; the summary at the top is written by hand.

A tag and a release are one thing in two places: the tag is the commit, the release is the
notes attached to it. Never move a tag that has been pushed — cut a new one.

## What belongs in release notes

Written for someone who uses Pixel Creator, not for someone reading the diff.

| Include | Example |
|---|---|
| **What a creator can now do** | "Tilemaps can be painted directly in the viewport" |
| **What changed in behaviour** | "An object turned off in the Hierarchy now also stops running" |
| **Anything that touches a saved format** | "Scenes saved before this release open correctly; scenes saved after it will not open in earlier builds" |
| **Fixed defects that were visible** | "Preview no longer reported a blocked pop-up on every press" |
| **Known limitations** | "The Timeline is still a shell" |
| **New or amended ADRs** | Link them |

Leave out: internal refactors nobody can observe, test-only changes, and documentation typos.

## Downloadable artifacts

**GitHub Releases are the canonical place for versioned downloadable artifacts** when such
artifacts exist.

Today, none do. Pixel Creator has no build step and produces no bundle: a release is source
plus notes. If a packaged artifact is ever produced, it is attached to the release rather than
committed to the repository or hosted separately.

## The exported game is not a release

*Share ▸ Export game…* writes a `.pxgame.json` bundle. That is a **creator's** artifact, not a
project release: it is the creator's game, it is played by pointing the game client at it
(`preview/index.html#u/<url>`), and it has nothing to do with the repository's version.

See [Preview and sharing](../user/preview-and-sharing.md).

## Future distribution — not current work

Recorded here so it is not mistaken for something that exists:

- **A PWA.** The editor is already a static page with no build step and an offline-capable
  storage layer, so an installable Progressive Web App is a plausible next step and would need
  a manifest and a service worker — the latter needing care, because a cached ES module graph is
  exactly the failure `tools/dev-server.py` exists to avoid in development.
- **Desktop packaging (Electron, Tauri).** Explicitly **not** planned as part of the current
  work. Pixel Creator is web-first by design; a desktop wrapper would add a build system, a
  release pipeline per platform, and a second set of bugs, for no capability the browser does
  not already give.
- **Hosted publishing.** Putting a creator's game on a URL for them needs accounts and
  permissions. The editor says so where a creator looks for it.

Either of the first two would be a decision, and therefore an [ADR](decisions.md).

## Branch protection and repository settings

Some of this cannot live in files. What a maintainer has to configure in GitHub's own settings —
default-branch protection, required checks, Pages, the repository description — is listed in
[CONTRIBUTING.md](../../CONTRIBUTING.md#repository-settings-maintainers) and
[Documentation website](documentation-website.md).
