# Architecture decisions (ADRs)

Pixel Creator keeps **72 Architecture Decision Records** in
[`docs/decisions/`](../decisions/). They are the reason the codebase is coherent after a full
rewrite, and they are the first thing to read when you are about to change something structural.

## What an ADR is here

> An ADR records a decision that **was taken**, dated and accepted. It is authoritative.

A proposal that has not been settled is **never** an ADR. The project keeps proposals
elsewhere — the data-model audits in [`migration/`](../migration/) are proposals, and they are
labelled as such; what they proposed has since been settled by the ADRs.

Every ADR carries:

| Field | Meaning |
|---|---|
| **Status** | `accepted`, with the date |
| **Decides** | Exactly which questions it settles |
| **Depends on** | The ADRs it builds on |
| **Does not decide** | What it deliberately leaves open — often the most useful line |
| **Amends** / **Revises** | When it changes an earlier decision or a written contract |

The body is usually: the observed defect or context, the decision, the alternatives that were
rejected and *why*, counter-examples, and the consequences — positive **and** negative.

## The register

[`PROJECT_MEMORY.md`](../PROJECT_MEMORY.md) holds the complete table.

> **That table is the complete list.** An ADR that is not in it does not exist; a file in
> `decisions/` that is not in it is a line to add.

[Architecture overview](architecture.md#where-each-subject-is-specified) maps each subject to
the ADR that settles it — start there when you are looking for the decision behind a piece of
code.

## When you need one

You need an ADR when a change would:

- **reverse, weaken or replace** an existing decision;
- change a **contract other code relies on** — a step order, a serialization shape, what an
  operation means, what a layer may import;
- introduce a **new structural concept** — a new kind of resource, a new layer, a new identity
  scheme, a new lifecycle hook;
- settle a question an existing ADR explicitly left open (its *"Does not decide"* section).

You do **not** need one for: a bug fix, a new component, a new graph node, a new editor panel,
a refactor inside one module, or wording and presentation changes — as long as they sit inside
what the existing decisions already allow.

If you are unsure, open an issue and ask before writing code. An ADR written after the fact to
justify a merged change is the failure mode this process exists to prevent.

## How to write one

1. **Read the ADRs it touches**, including their *"Does not decide"* sections.
2. **Number it** with the next free number, four digits.
3. **Name the file** `ADR-NNNN-a-short-kebab-case-title.md`. The title is a *sentence about the
   decision*, not a topic label — look at the existing ones: *"A prefab is a Resource,
   resolved before the simulation"*, *"A warning stops nothing"*.
4. **Copy the header shape** from a recent ADR.
5. **State the observed defect or context first.** Decisions in this project are justified by
   something measured or observed, not by taste. If there is no observation, there may be no
   decision to make yet.
6. **Write down what you rejected, and why.** This is what makes an ADR useful two years later.
7. **Write the negative consequences too.** An ADR with only upsides has not been thought
   through.
8. **Add the line to the register** in `PROJECT_MEMORY.md`.

Then implement it, and reference the ADR in the code — the codebase cites ADRs in comments
precisely where a reader would otherwise ask "why is it like this?".

## Superseding one

Do not delete or rewrite an accepted ADR to make the documentation tidier. **Preserving the
history is the point.** A decision that changes gets a new ADR that says, in its header, which
one it amends or revises — and the old one stays where it is.

ADR-0015 is the worked example: it was revised in place with an explicit note, and the register
records both the original acceptance date and the revision.

## Related reading

- [PROJECT.md](../PROJECT.md) — the project's non-negotiable constraints
- [ARCHITECTURE.md](../ARCHITECTURE.md) — the specification the ADRs feed
- [CONVENTIONS.md](../CONVENTIONS.md) — how documents label what they assert
  (`OBSERVED IN LEGACY`, `HISTORICAL DECISION`, `V2 PROPOSAL`, `OPEN QUESTION`)
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — where an ADR fits in a pull request
