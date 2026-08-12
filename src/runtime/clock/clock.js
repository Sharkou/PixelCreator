// Simulation clock.
//
// Simulation runs at a FIXED step, independent of how often the screen refreshes.
// Real time, render rate and simulation rate are three different things, and Legacy
// conflated all three: `Time.deltaTime` was derived from the render loop, so the
// simulation ran faster on a 144 Hz display than on a 60 Hz one.
//
// This matters far beyond smoothness. Multiplayer requires the server and every client
// to run the same simulation and reach the same result; that is only possible if the
// step is fixed and identical everywhere. A server has no display at all and still has
// to advance time exactly like a browser does — which is why this clock has nothing to
// do with rendering and knows nothing about frames.
//
// The pattern is the standard accumulator:
//
//   const steps = clock.advance(elapsedSeconds);
//   for (let i = 0; i < steps; i++) runtime.step();
//   renderer.render(scene);        // optionally interpolated with clock.alpha

export class Clock {

    #fixedStep;
    #maxStepsPerAdvance;
    #accumulator = 0;
    #time = 0;
    #steps = 0;

    /**
     * Create a clock.
     * @param {object} [options] - Options
     * @param {number} [options.fixedStep] - Simulation step in seconds, 1/60 by default
     * @param {number} [options.maxStepsPerAdvance] - Cap on steps caught up in one advance
     */
    constructor({ fixedStep = 1 / 60, maxStepsPerAdvance = 5 } = {}) {
        if (!(fixedStep > 0)) throw new RangeError('Clock: fixedStep must be greater than zero');
        if (!(maxStepsPerAdvance >= 1)) throw new RangeError('Clock: maxStepsPerAdvance must be at least 1');

        this.#fixedStep = fixedStep;
        this.#maxStepsPerAdvance = maxStepsPerAdvance;
    }

    /** Duration of one simulation step, in seconds. */
    get fixedStep() {
        return this.#fixedStep;
    }

    /** Simulated time elapsed, in seconds. Advances only in whole steps. */
    get time() {
        return this.#time;
    }

    /** How many simulation steps have run since the clock was created. */
    get steps() {
        return this.#steps;
    }

    /**
     * How far the next step already is, between 0 and 1.
     *
     * Rendering can use it to interpolate between the previous and next simulation
     * state, so a fixed-step simulation still looks smooth on any display.
     */
    get alpha() {
        const progress = this.#accumulator / this.#fixedStep;
        return progress < 0 ? 0 : Math.min(progress, 1);
    }

    /**
     * Feed real time in and get the number of simulation steps owed.
     *
     * Time beyond the cap is dropped rather than queued: a tab that was backgrounded for
     * a minute must not come back and run three thousand steps at once, freezing the
     * page and, in multiplayer, flooding the server.
     *
     * @param {number} elapsedSeconds - Real time since the previous call
     * @returns {number} Steps to run now
     */
    advance(elapsedSeconds) {
        if (!globalThis.Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 0;

        this.#accumulator += elapsedSeconds;

        // Repeated subtraction with a relative tolerance. Feeding exact frame durations
        // such as 1/144 accumulates a rounding error of a few ulp, and a bare
        // `accumulator >= fixedStep` would drop roughly one step per second because the
        // accumulator lands a hair short of the threshold.
        const tolerance = this.#fixedStep * 1e-9;
        let steps = 0;

        while (this.#accumulator + tolerance >= this.#fixedStep) {
            this.#accumulator -= this.#fixedStep;
            steps++;

            if (steps >= this.#maxStepsPerAdvance) {
                // Drop the remaining backlog instead of queueing it.
                if (this.#accumulator > this.#fixedStep) this.#accumulator = 0;
                break;
            }
        }

        return steps;
    }

    /**
     * Record that one simulation step has run.
     * @returns {number} The simulated time after the step
     */
    tick() {
        this.#steps++;
        this.#time += this.#fixedStep;
        return this.#time;
    }

    /** Reset simulated time and the accumulator. */
    reset() {
        this.#accumulator = 0;
        this.#time = 0;
        this.#steps = 0;
    }
}
