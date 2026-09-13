# ADR-0055 — Two widths, one grid

- **Status:** **accepted** (2026-09-07)
- **Decides:** what a lone control on its row measures; which types take both cells of the value
  column; what a handle gutter reserves; where a region banner's height lives; what an empty panel
  draws
- **Depends on:** ADR-0006 (a window announces, the shell routes), ADR-0007 (the Inspector's schema),
  ADR-0023 (property types), ADR-0045 §9 (a colour becomes short again), ADR-0046 §7 (two widths,
  declared once)
- **Amends:** ADR-0047 §4 — **replaced**: a lone control takes both cells back; ADR-0046 §7 — "a word
  and a chosen option" are no longer short
- **Does not decide:** a node card's width (it stays ADR-0046 §7's, and the node does not read
  `isWide`); the 62 px label column; touch density

---

## 1. Three grids, three right edges, and no alignment

ADR-0046 §7 set the useful rule: **a short control takes one cell, a wide control takes both.**
ADR-0047 §4 corrected it by giving a lone control "four parts of control to one part of air", about
70 %. Measured in Chrome, panel at 304 px:

| Row | Right edge (px from the panel's edge) |
|---|---|
| a lone number | 165 |
| `Alpha`, alone on its row | **233** |
| `Position`'s `Y` | 280 |

The edge at 233 lines up with nothing. The correction was aimed at two right margins and produced
three — because it treated the symptom (a Sprite field running further than the numbers) rather than
the cause: **the value column has two cells, and a wide control takes two.** That is what ADR-0046 §7
says, and it is what lines a `Sprite`'s right edge up with `Position`'s `Y`, exactly.

> **One grid for every row: `1fr` · gutter · `1fr` · gutter. A short control takes the first cell, a
> pair takes one each, and a wide control takes both cells and the middle gutter.**

There were three grid declarations in `windows/inspector.js`; there is one, and two placement rules.
The two right edges are at 165 and 276, and nothing else.

## 2. Typing is showing

ADR-0046 §7 filed "a word and a chosen option" among the short values. The consequence, never measured:
`Name` and `Tag` — the first two rows a creator meets — fitted in a ten-character box, and an `enum`
was too narrow to read the option it displayed. A control you **type** into or whose choice you
**read** has no "short value" to show: it has text.

`STRING` and `ENUM` therefore join `RESOURCE`, `OBJECT`, `RANGE`, `LIST` and `READONLY` in
`WIDE_KINDS` (`inspector/schema.js`). `COLOR` stays short: a swatch has no content that overflows, it
has a target you click — ADR-0046 §7's correction holds.

The rule was "measured in Chrome" and nowhere else, which is exactly why it could drift. It now has a
test (`schema.test.js`).

## 3. A gutter is declared once, and it knows what it holds

The grid wrote `16px` literally at both of its ends, and the handle placed there took its width from
the glyph. Two ways of saying the same number, only one of which would move the day the other
changed. `--grip` is declared at the top of the panel's sheet, is `var(--px-icon)` — a handle IS an
icon at the small size — and is read by the grid and by the handle.

It is not a design token: nothing outside the Inspector lays anything out against a handle. And the
gutter stays the size of the glyph rather than shrinking to the ink it draws: it is a drag target, and
a gesture is aimed at.

`icon()` in fact rounds any requested size to 16 or 20 (`ui/icons.js`), so the `12`s and the `14`
passed to a few calls never reached the DOM. They are removed: a number that does nothing is a number
somebody will believe later.

## 4. A region banner has a height, and there are three regions

A `px-window`'s header measured `--px-hit + --px-space-2`; the scene's tab strip measured `--px-hit`.
The two sit side by side on the same line, so the seam crossing the top of the workspace stepped down
seven pixels halfway across.

`--px-header` is that height, declared in `ui/styles.js` and read by both. A token with two consumers
is a token; it is the same rule that made the 62 px label column a local constant and not a token.

## 5. An empty state, and there were four

`ui/empty-state.js` exists "because two windows show one and they must not diverge". Three others had
diverged: the Inspector centred its own with 32 px of margin and a glyph at 0.35, the Graph repeated
the same six properties one text step lower, the Hierarchy printed a paragraph with no glyph. They
differ in **what they say**, which is the whole point of an empty state, and in nothing else.

The Graph keeps one line of its own — a canvas has no body to fill, so its state floats above the
plane.

## 6. What a shadow root does not see

`[hidden] { display: none !important }` was declared for the document and not for the shadow roots,
where any `display` declaration of a window beats the browser's default. Four windows had discovered
the fact separately and each patched it on their own. It is stated once in the base sheet, for the
same reason as `box-sizing`: a document rule does not cross a shadow boundary.

## 7. Observable contracts

| Contract | Verifiable by |
|---|---|
| A short control measures one cell, a wide one both | `schema.test.js`, and measured in Chrome |
| Every right edge in the panel falls on one of two x positions | `getBoundingClientRect()` on `.fields` |
| `Name`, `Tag` and an `enum` hold a readable name | by eye |
| A gutter reserves the size of the glyph it holds | measured |
| The tab strip and the window headers end on the same line | measured |
| An empty state is the same object in all five windows | by eye, and one rule |
| An element carrying `hidden` inside a shadow root disappears | the Graph's empty state, a placed node |
