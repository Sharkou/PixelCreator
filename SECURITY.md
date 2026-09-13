# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately, by either route:

1. **GitHub private vulnerability reporting** — the *Security* tab of this repository ▸
   *Report a vulnerability*. This is preferred: it keeps the report, the discussion and the fix
   in one place, visible only to the maintainers.
2. **Email** — <contact@pixelcreator.io>, with `SECURITY` in the subject line.

### What to include

- What the problem is, and what an attacker could achieve with it.
- The smallest set of steps that reproduces it.
- Which surface it affects: the online editor, the code in this repository, or the game client.
- Browser and version, if it is browser-specific.
- Your assessment of the impact.

**Send only what is needed to reproduce and confirm the problem.** Do not publish a working
exploit, and do not include third parties' data. If a proof of concept is genuinely required,
say so in the report and we will agree how to share it.

### What to expect

| | |
|---|---|
| **Acknowledgement** | Within 7 days |
| **Initial assessment** | Within 14 days |
| **Fix** | As soon as the severity warrants; you will be kept informed |
| **Disclosure** | Coordinated. We will agree a date with you, and credit you unless you prefer otherwise |

Pixel Creator is maintained by one person as an alpha-stage project. Response times are a
best effort, not a contractual commitment.

## Scope

### In scope

- **The code in this repository** — the editor (`src/editor/`), the runtime (`src/runtime/`),
  the core (`src/core/`), the project layer (`src/project/`) and the game client
  (`src/preview/`).
- **The hosted editor** at `editor.pixelcreator.io`, insofar as the defect is in the client code.
- **Anything that lets one creator's project reach another's data**, or lets a game bundle
  escape the isolation a browser gives it.

Realistic classes of issue for a browser-only application with no backend:

- cross-site scripting through a project name, a resource name, a graph value or an imported
  file;
- a game bundle (`.pxgame.json`) that executes something it should not when loaded by the game
  client;
- a path or key injection into the persistence layer that lets one project read or overwrite
  another's data;
- a denial of service reachable from an ordinary project — beyond the node budget and the
  suspended-execution cap, which exist precisely to bound this
  ([ADR-0064](docs/decisions/ADR-0064-measure-before-optimising-refuse-before-running.md),
  [ADR-0072](docs/decisions/ADR-0072-un-avertissement-n-arrete-rien.md));
- leaking anything from the host page into a preview, or vice versa.

### Out of scope

- **`legacy/`** — the previous engine, kept as a read-only historical reference. It is not
  deployed, it is not maintained, and it is known to contain defects that are documented rather
  than fixed ([docs/MIGRATION.md](docs/MIGRATION.md) §4). Reports about it will be closed as
  out of scope.
- **The private server.** It is not in this repository. Do not probe, test or attempt to access
  Pixel Creator's backend infrastructure; that is neither authorised nor covered here.
- **`pixelcreator.io` beyond the editor** — the marketing site, the forum and any other part of
  the platform. Report those to <contact@pixelcreator.io> as well, but they are not this
  repository's code.
- **Third-party services** — GitHub, Discord, the CDNs a browser uses. Report to them.
- Missing hardening headers, best-practice recommendations and automated-scanner output with no
  demonstrated impact.
- Social engineering, physical access, and denial of service against the hosted site by volume.

## What we ask of you

- Give us a reasonable chance to fix the problem before disclosing it publicly.
- Use only your own projects and your own data while investigating.
- Do not degrade the service for other people, and do not access, modify or exfiltrate anyone
  else's data.
- Stay within the scope above.

There is no bug bounty programme. Credit in the release notes and our genuine thanks are what we
can offer.

## Supported versions

Pixel Creator v2 is an alpha. **Only the current state of the default branch, and the hosted
editor built from it, are supported.** There are no maintained release branches and no
backports; a fix lands on `master` and reaches the hosted editor from there.

See [docs/developer/releases.md](docs/developer/releases.md).

## A note on how projects are stored

Pixel Creator has no accounts and no server-side storage. A creator's project lives in **their
own browser**, in IndexedDB, and an exported game is a file on their own disk. There is no
central store of user data to breach — which shapes what a vulnerability here can and cannot
reach, and is worth keeping in mind when assessing impact.
