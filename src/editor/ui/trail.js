// A breadcrumb that is too long for its strip — which ends it keeps, and which it folds.
//
// THE THREE WAYS TO HANDLE A DEEP TRAIL, AND WHY TWO OF THEM ARE WRONG.
//
//   scroll sideways   a horizontal scrollbar inside a 26 px strip is a control nobody
//                     finds, and the far end — where the creator actually is — starts off
//                     screen;
//   overflow: hidden  the same, minus the way back: folders become unreachable, which is
//                     the one thing a navigation control may never do;
//   FOLD              keep the ends, put the middle behind one button that LISTS what it
//                     swallowed. Nothing is unreachable; a hidden folder is one click away.
//
// WHICH ENDS. The ROOT is where a creator goes to start over. The LAST is where they are.
// The one before last is the way UP, which is the most-used step of any trail — so the
// fold takes from the middle outwards and never eats those three.
//
// It is pure and it counts rather than measures: a strip fits about five steps at the
// Editor's density, and folding at a count is stable — folding at a measured width makes
// the trail rearrange itself as a folder is renamed, which is worse than being one step
// too long.

/** How many steps a trail shows before it folds, the root not counted. */
export const TRAIL_LIMIT = 4;

/**
 * The trail as it should be drawn.
 *
 * The root is the caller's business — it is always shown, and it is not a folder — so this
 * takes the chain BELOW it, outermost first, and answers what to draw after it.
 *
 * @param {object[]} chain - The folders from the outermost to the one being looked at
 * @param {number} [limit] - How many steps may be drawn before folding
 * @returns {Array<{folder?: object, here?: boolean, folded?: boolean, hidden?: object[]}>}
 *   One entry per thing to draw, in order
 */
export function foldTrail(chain, limit = TRAIL_LIMIT) {
    const steps = [...(chain ?? [])];
    const step = (folder, index) => ({ folder, here: index === steps.length - 1 });

    if (steps.length <= Math.max(1, limit)) return steps.map(step);

    // The last two are the folder being looked at and the way up to its parent; the fold
    // takes everything before them.
    const kept = steps.slice(-2);
    const hidden = steps.slice(0, -2);

    return [
        { folded: true, hidden },
        ...kept.map((folder, index) => ({ folder, here: index === kept.length - 1 }))
    ];
}
