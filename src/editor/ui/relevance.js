// How well an entry answers a query — one scorer, for every menu that filters.
//
// `label.toLowerCase().includes(query)` IS NOT A SEARCH, and the node menu is where that
// stops being an opinion. Typing `multiply` matched `Multiply` and also nothing else, so
// it looked fine; typing `float` matched nothing at all, because the node is called
// `Number`; typing `event` matched `On Update` only by accident of the word "event"
// appearing nowhere in it. A creator who knows what they want has to scroll a list of
// twenty to find it.
//
// WHAT A MATCH IS WORTH, IN ORDER. An entry carries several strings — what it is called,
// what its type is, which group it is in, what else a creator might call it — and where
// the needle lands says how confident the answer is:
//
//   the whole label                          exact
//   the start of the label                   prefix
//   the start of a word inside the label     word start
//   anywhere in the label                    substring
//   the same, in the type / category / alias  the same, discounted by field
//
// A SUBSEQUENCE IS THE FLOOR, NOT THE FIRST ANSWER. `mlt` finding `Multiply` is what makes
// a picker feel quick, and it is also what makes a naive fuzzy matcher return everything:
// almost any three letters are a subsequence of a long enough string. So it scores below
// every literal match and only shows when there is nothing better.
//
// PURE, AND THAT IS THE POINT. Ranking is the part of a picker that is easy to get subtly
// wrong and impossible to check by looking at it, so it lives here with a test file rather
// than inside a menu that needs a browser to run.

/** How much a match is worth, before the field it was found in discounts it. */
const EXACT = 1000;
const PREFIX = 600;
const WORD = 400;
const SUBSTRING = 200;
const SUBSEQUENCE = 60;

/**
 * How much each field of an entry counts, relative to its name.
 *
 * A name is what a creator typed at; a category is where they would have looked. Both
 * should match, and a match on the name must always win — `Number` beats every node in a
 * category that happens to contain the letters of "number".
 */
const FIELDS = [
    { key: 'label', weight: 1 },
    { key: 'type', weight: 0.55 },
    { key: 'category', weight: 0.5 },
    { key: 'keywords', weight: 0.45 }
];

/**
 * Score one entry against a query.
 *
 * @param {object} entry - `{ label, type, category, keywords }`; anything absent is skipped
 * @param {string} query - What the creator typed
 * @returns {number} A score; 0 when the entry does not answer the query at all
 */
export function score(entry, query) {
    const needle = normalise(query);
    if (needle === '') return 0;

    // THE WHOLE QUERY AGAINST ONE FIELD IS STILL THE STRONGEST READING, and it is tried
    // first so that every single-word search ranks exactly as it always did.
    let best = fieldScore(entry, needle);

    // A QUERY MAY NAME THE GROUP AND THE ROW, AND UNTIL NOW IT COULD NAME NEITHER
    // (ADR-0048 §1). `Transform Position X` found nothing: `Transform` is the entry's
    // CATEGORY and `Position X` is its LABEL, and no single field holds both — so the one
    // query a creator writes when they know exactly what they want was the one that failed.
    // That mattered the moment the Component field was removed and the group became part of
    // how a property is named.
    //
    // EVERY WORD MUST BE ANSWERED, BY WHICHEVER FIELD ANSWERS IT. That is an AND, so the
    // list gets shorter as a creator types rather than longer — the behaviour a filter is
    // expected to have. The score is the mean, so a two-word query that matches two labels
    // exactly still outranks one that only brushes them.
    if (best === 0) {
        const words = needle.split(/\s+/).filter(Boolean);
        if (words.length > 1) {
            let total = 0;
            for (const word of words) {
                const answered = fieldScore(entry, word);
                if (answered === 0) return 0;
                total += answered;
            }
            best = total / words.length;
        }
    }

    // A shorter label containing the same needle is the more likely answer: `Add` before
    // `Add Component`. Small enough never to outrank a better kind of match.
    const length = normalise(entry?.label ?? '').length;
    return best > 0 ? best + Math.max(0, 40 - length) / 10 : 0;
}

/**
 * The best any one field of an entry does against a needle.
 *
 * @param {object} entry - The entry
 * @param {string} needle - Already normalised
 * @returns {number} The weighted score, 0 when nothing answers
 */
function fieldScore(entry, needle) {
    let best = 0;
    for (const field of FIELDS) {
        for (const value of valuesOf(entry?.[field.key])) {
            best = Math.max(best, matchScore(normalise(value), needle) * field.weight);
        }
    }
    return best;
}

/**
 * Rank entries against a query, dropping the ones that do not answer it.
 *
 * Stable within one score, so an empty query — or a tie — leaves the catalogue in the
 * order it declared itself, which is the order a creator learned.
 *
 * @param {object[]} entries - The entries to rank
 * @param {string} query - What the creator typed
 * @returns {object[]} The entries that match, best first
 */
export function rank(entries, query) {
    if (normalise(query) === '') return [...entries];

    return entries
        .map((entry, index) => ({ entry, index, value: score(entry, query) }))
        .filter(scored => scored.value > 0)
        .sort((a, b) => b.value - a.value || a.index - b.index)
        .map(scored => scored.entry);
}

/**
 * Whether a query is answered by an entry at all.
 * @param {object} entry - The entry
 * @param {string} query - What the creator typed
 * @returns {boolean} True when it would appear in the results
 */
export function matches(entry, query) {
    return normalise(query) === '' || score(entry, query) > 0;
}

/** What one field of an entry is worth against a needle, both already normalised. */
function matchScore(value, needle) {
    if (value === '') return 0;
    if (value === needle) return EXACT;
    if (value.startsWith(needle)) return PREFIX;

    const at = value.indexOf(needle);
    if (at > 0) {
        // A word boundary is a space, a dot or a case change — `property.set` and
        // `SetProperty` both start a word at `set`, and a creator types the word.
        const boundary = /[\s._-]/.test(value[at - 1]);
        return boundary ? WORD : SUBSTRING;
    }

    return subsequence(value, needle) ? SUBSEQUENCE : 0;
}

/** Whether every letter of the needle appears in the value, in order. */
function subsequence(value, needle) {
    let at = 0;
    for (const letter of needle) {
        at = value.indexOf(letter, at) + 1;
        if (at === 0) return false;
    }
    return true;
}

/** A field's values, whether it holds one string or several. */
function valuesOf(field) {
    if (typeof field === 'string') return [field];
    if (globalThis.Array.isArray(field)) return field.filter(entry => typeof entry === 'string');
    return [];
}

/**
 * A string as it is compared: lower case, and a camel hump read as a word break.
 *
 * `setProperty` becomes `set property`, so typing `property` finds it at a word start
 * rather than in the middle of one — which is the difference between third result and
 * first.
 *
 * @param {string} value - The raw string
 * @returns {string} The comparable form
 */
export function normalise(value) {
    return globalThis.String(value ?? '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .trim();
}
