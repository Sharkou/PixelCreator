import { Recorder } from './recorder.js';
import { flushTimers } from '../env/globals.js';

/**
 * Run one scenario against one target.
 * @param {object} scenario - The scenario definition
 * @param {object} adapter - The target adapter module
 * @returns {Promise<object>} The normalized observation
 */
export async function runScenario(scenario, adapter) {
    const recorder = new Recorder();
    let api = null;

    try {
        api = await adapter.createTarget(recorder);

        if (scenario.needsProbe && !api.probe?.available) {
            return { id: scenario.id, skipped: 'target has no Legacy probes' };
        }

        const returned = await scenario.run(api, recorder);

        // Legacy's throttle defers some sends by one macrotask; let them land.
        await flushTimers();

        const observed = recorder.result();

        if (scenario.unordered) {
            observed.network = sortStable(observed.network);
            observed.operations = sortStable(observed.operations);
        }

        // Some Legacy behaviour is genuinely time-dependent (the delay=0 throttle in
        // Network.sync()). Rather than let it flake, a scenario can declare the field
        // non-comparable and assert on a deterministic summary instead.
        for (const field of scenario.volatile ?? []) {
            observed[field] = '<not compared: time-dependent>';
        }

        return {
            id: scenario.id,
            title: scenario.title,
            status: scenario.status,
            returned: recorder.normalize(returned ?? null),
            ...observed
        };
    } catch (error) {
        return {
            id: scenario.id,
            title: scenario.title,
            status: scenario.status,
            error: `${error.name}: ${error.message}`
        };
    } finally {
        api?.dispose?.();
    }
}

/**
 * Run every applicable scenario against a target.
 * @param {Array} scenarios - The scenario list
 * @param {object} adapter - The target adapter module
 */
export async function runAll(scenarios, adapter) {
    // Fail fast on an unusable target, instead of repeating the same error per scenario.
    await adapter.createTarget(new Recorder()).then(t => t?.dispose?.());

    const results = {};
    const applicable = [];
    for (const scenario of scenarios) {
        const targets = scenario.targets ?? ['legacy', 'v2'];
        if (!targets.includes(adapter.name)) continue;
        applicable.push(scenario.id);
        results[scenario.id] = await runScenario(scenario, adapter);
    }
    return { results, applicable };
}

function sortStable(list) {
    return [...list].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
