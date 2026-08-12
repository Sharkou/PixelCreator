import { STATUS, divergenceFor } from '../mapping.js';

export const VERDICT = {
    IDENTICAL: 'identical',
    INTENTIONAL: 'intentional',
    UNEXPECTED: 'unexpected',
    NEW: 'new',
    MISSING: 'missing',
    ERROR: 'error'
};

/**
 * Compare a run against a reference, and classify each scenario.
 * @param {object} current - Results of this run
 * @param {object} reference - Stored baseline, or a previous target's results
 * @returns {Array} One verdict per scenario
 */
export function compare(current, reference, applicable = null) {
    const ids = new Set([...Object.keys(current), ...Object.keys(reference ?? {})]);
    const verdicts = [];

    for (const id of [...ids].sort()) {
        // A scenario that does not target the current adapter (Legacy-only probes on a
        // v2 run) is out of scope, not missing.
        if (applicable && !applicable.includes(id)) continue;

        const now = current[id];
        const before = reference?.[id];

        if (!now) {
            verdicts.push({ id, verdict: VERDICT.MISSING, title: before?.title });
            continue;
        }
        if (now.error) {
            verdicts.push({ id, verdict: VERDICT.ERROR, title: now.title, detail: now.error });
            continue;
        }
        if (now.skipped) {
            continue;
        }
        if (!before) {
            verdicts.push({ id, verdict: VERDICT.NEW, title: now.title, status: now.status });
            continue;
        }

        const diff = diffObservation(before, now);

        if (diff.length === 0) {
            verdicts.push({ id, verdict: VERDICT.IDENTICAL, title: now.title, status: now.status });
            continue;
        }

        // A declared divergence, or a scenario that documents a Legacy quirk/bug,
        // is expected to differ once v2 exists — it is never a regression.
        const declared = divergenceFor(id);
        const tolerated = declared || now.status === STATUS.QUIRK || now.status === STATUS.BUG;

        verdicts.push({
            id,
            title: now.title,
            status: now.status,
            verdict: tolerated ? VERDICT.INTENTIONAL : VERDICT.UNEXPECTED,
            reason: declared?.reason,
            detail: diff
        });
    }

    return verdicts;
}

function diffObservation(before, now) {
    const diffs = [];
    for (const key of ['returned', 'notifications', 'operations', 'network']) {
        const a = JSON.stringify(before[key] ?? null, null, 1);
        const b = JSON.stringify(now[key] ?? null, null, 1);
        if (a !== b) diffs.push({ field: key, expected: before[key] ?? null, actual: now[key] ?? null });
    }
    return diffs;
}
