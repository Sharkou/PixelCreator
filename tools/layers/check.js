// Layer-rule evaluation.
//
// Pure: it takes a profile and a list of import edges and returns verdicts. No file
// system, no console. That is what makes the rules testable against synthetic edges
// instead of a fixture tree on disk.

/**
 * Find the layer a path belongs to.
 * @param {object} profile - The profile
 * @param {string|null} path - A path relative to the profile root
 * @returns {string|null} The layer name, or null when the path is outside every layer
 */
export function layerOf(profile, path) {
    if (!path) return null;
    return profile.layers.find(layer => layer.test(path))?.name ?? null;
}

/**
 * Tell whether an edge between two layers is forbidden.
 * @param {object} profile - The profile
 * @param {string} from - Source layer
 * @param {string} to - Target layer
 * @returns {boolean} True when forbidden
 */
export function isForbidden(profile, from, to) {
    return profile.forbidden.some(edge => edge.from === from && edge.to === to);
}

/**
 * Classify every import edge against a profile.
 *
 * A forbidden edge listed in `knownViolations` is reported as tracked rather than
 * failing: it is already documented and already understood. Anything else forbidden is
 * a regression. A declared violation no longer found in the source is reported as
 * stale, so the declaration can be removed once the underlying issue is fixed.
 *
 * @param {object} profile - The profile
 * @param {Array<{file: string, specifier: string, target: string|null}>} edges - Scanned imports
 * @returns {{tracked: Array, unexpected: Array, stale: Array, scanned: number}} The verdicts
 */
export function evaluateProfile(profile, edges) {
    const tracked = [];
    const unexpected = [];
    const matched = new Set();

    for (const { file, specifier, target } of edges) {
        const from = layerOf(profile, file);
        const to = layerOf(profile, target);

        if (!from || !to || from === to) continue;
        if (!isForbidden(profile, from, to)) continue;

        const known = profile.knownViolations.find(
            violation => violation.file === file && violation.specifier === specifier
        );

        if (known) {
            matched.add(known);
            tracked.push({ file, specifier, from, to, known });
        } else {
            unexpected.push({ file, specifier, from, to });
        }
    }

    const stale = profile.knownViolations.filter(violation => !matched.has(violation));

    return { tracked, unexpected, stale, scanned: edges.length };
}
