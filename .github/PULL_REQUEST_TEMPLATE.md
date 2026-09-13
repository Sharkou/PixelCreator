<!--
  Thanks for contributing to Pixel Creator.

  Base branch: master. Delete any section below that does not apply — an honest short
  pull request beats a template filled in for the sake of it.
-->

## What this changes

<!-- One or two sentences. What can somebody do now that they could not before, or what
     stopped being broken? -->

## Why

<!-- The problem, or the issue this closes. -->

Closes #

## Type

- [ ] `fix` — a defect
- [ ] `feat` — new behaviour
- [ ] `refactor` — no behaviour change
- [ ] `docs` — documentation only
- [ ] `test` — tests or tooling only

## Verification

Which checks did you run? (see [CONTRIBUTING.md](../CONTRIBUTING.md#verification--run-this-before-every-pull-request))

- [ ] `tools/test.sh`
- [ ] `node tools/layers/run.js`
- [ ] `node tools/check-boot.js`
- [ ] `node tools/check-exports.js`
- [ ] `node tools/check-css-literals.js`
- [ ] `node tools/parity/run.js`
- [ ] `node tools/check-links.js`
- [ ] Added or updated tests for what changed

## Browser validation

<!-- Required for any change to UI, interaction, rendering or the runtime. Say what you
     actually exercised — that is the part a reviewer cannot get from the diff. Write
     "not applicable" if the change cannot be observed in the browser. -->

## Architecture

- [ ] This change sits inside the existing [architecture decisions](../docs/PROJECT_MEMORY.md)
- [ ] This change needs an ADR, and it is included / was discussed in an issue first

<!-- An ADR is needed when a change reverses, weakens or replaces a documented decision;
     changes a contract other code relies on (step order, serialization shape, what an
     operation means, what a layer may import); or introduces a new structural concept.
     See docs/developer/decisions.md -->

## Saved formats

- [ ] No saved format changed
- [ ] A format version changed (`FORMAT_VERSION`, `MANIFEST_VERSION`, `GRAPH_VERSION`,
      `BUNDLE_FORMAT`, `PREFAB_FORMAT`, `TILESET_FORMAT`, `ANIMATION_FORMAT`) — and existing
      projects still open, because:

## Checklist

- [ ] Branched from `master`, named `feat/…`, `fix/…`, `docs/…`, `refactor/…` or `test/…`
- [ ] Commit messages follow the repository's style (`feat(scope): …`)
- [ ] No new dependency, no `package.json`, no build step
- [ ] Nothing in `legacy/` was modified
- [ ] Follows [`docs/CONVENTIONS.md`](../docs/CONVENTIONS.md)
- [ ] Documentation updated if behaviour a user or a contributor can see has changed
- [ ] `CHANGELOG.md` updated under `[Unreleased]`, if the change is observable

## Anything else

<!-- Screenshots for a visual change, trade-offs you weighed, parts you are unsure about,
     follow-up work you deliberately left out. -->
