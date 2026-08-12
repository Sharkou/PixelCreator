// Legacy → v2 semantic mapping, and the list of divergences that are DELIBERATE.
//
// This file is the contract boundary. Anything not listed here as a divergence is,
// by default, expected to behave identically in v2.
//
// Rule (MIGRATION.md): a known Legacy defect must never silently become a v2 contract.
// That is what `status` on each scenario enforces:
//
//   contract  v2 MUST reproduce this behaviour
//   quirk     Legacy-specific; v2 is free to differ, and a difference is not a failure
//   bug       Legacy is wrong; v2 MUST NOT reproduce it — matching would be the failure

export const STATUS = {
    CONTRACT: 'contract',
    QUIRK: 'quirk',
    BUG: 'bug'
};

/** How each neutral operation is expressed on each target. */
export const API_MAPPING = [
    {
        neutral: 'writeDirect',
        legacy: 'object.x = v',
        v2: 'object.x = v',
        note: 'Direct state mutation. Notifies views, produces no Operation.'
    },
    {
        neutral: 'writeControlled',
        legacy: 'object.syncProperty("x", v)',
        v2: 'object.setProperty("x", v)',
        note: 'Controlled model path. The role of $x / syncProperty() is taken over by setProperty().'
    },
    {
        neutral: 'applyRemote',
        legacy: 'object.x = v (what Network.update does)',
        v2: 'applyOperation({ origin: "network" })',
        note: 'Applying an incoming change, without echo.'
    },
    {
        neutral: 'probe.dollarWrite',
        legacy: 'object.$x = v',
        v2: null,
        note: 'REMOVED in v2. Legacy probe only — no v2 scenario uses it.'
    },
    {
        neutral: 'probe.legacySetProperty',
        legacy: 'object.setProperty("x", v)',
        v2: null,
        note: 'Legacy setProperty() writes _x without replicating. That meaning disappears in v2, '
            + 'where the same name denotes the controlled path. Legacy probe only.'
    },
    {
        neutral: 'probe.internal',
        legacy: 'object._x / object.__x',
        v2: null,
        note: 'Legacy internal layers. Documented, never promoted to a v2 API.'
    }
];

/**
 * Deliberate divergences, keyed by scenario id.
 * A divergence listed here is reported as expected, never as a regression.
 */
export const INTENTIONAL_DIVERGENCES = {
    'property/legacy-set-property-path': {
        reason: 'Legacy setProperty() writes _x without producing a controlled mutation. '
              + 'In v2, setProperty() IS the controlled path (ADR-0003). Opposite meaning, identical name.'
    },
    'property/dollar-write': {
        reason: 'The $x syntax is removed in v2 (final decision). No equivalent.'
    },
    'property/internal-layers': {
        reason: '_x / __x are Legacy implementation details. The v2 Proxy makes them unnecessary '
              + 'and no public API depends on them.'
    },
    'property/dynamic-not-reactive': {
        reason: 'Legacy does not make a property added after construction reactive. '
              + 'The v2 Proxy fixes that defect: the divergence is the goal.'
    },
    'serialization/underscore-duplication': {
        reason: 'Legacy serializes _prop twice over (factor ~3). v2 stores no duplicates.'
    },
    'serialization/children-duplicated': {
        reason: 'Legacy serializes every child twice. v2 references children by id.'
    },
    'network/no-batching': {
        reason: 'No batching in Legacy: every keystroke produces its own operation. '
              + 'v2 introduces batching (ADR-0008), hence fewer operations for the same input.'
    },
    'scene/copy-from-live-object-wipes-containers': {
        reason: 'copy() reads the write-only $prop accessors and resets components/childs/image '
              + 'to undefined. Removing $ and using explicit v2 serialization makes the problem disappear.'
    },
    'scene/instantiate-throws-with-components': {
        reason: 'Direct consequence of the bug above: instantiate() throws as soon as a component is present. '
              + 'v2 must instantiate without error.'
    },
    'property/construction-emits-every-property': {
        reason: 'System.sync() rewrites every property at construction and therefore emits 19 notifications '
              + 'for an empty object. The v2 Proxy does not need that restoration pass.'
    },
    'property/enumerable-pollution': {
        reason: '57 enumerable keys for 19 public properties (x3). The v2 Proxy stores no duplicates.'
    },
    'component/tilemap-signature': {
        reason: 'Tilemap.draw(ctx, camera) is incompatible with Object.draw(). '
              + 'v2 mandates draw(self, renderer).'
    }
};

export function divergenceFor(scenarioId) {
    return INTENTIONAL_DIVERGENCES[scenarioId] ?? null;
}
