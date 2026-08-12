// Minimal globals required to import the Legacy Core outside a browser.
//
// Most Legacy modules guard top-level DOM code with `if (window.document)`
// (system.js:255, keyboard.js:51, mouse.js:102, editor/system/dnd.js:124).
// Providing a `window` WITHOUT a `document` therefore loads the Core cleanly and
// skips all browser-only listener registration — no DOM stub needed.
//
// OBSERVED INCONSISTENCY: gamepad.js:211 guards with `typeof window !== 'undefined'`
// instead, so it *does* run and calls window.addEventListener. Hence the no-op
// listener API below. Same intent, two different guards — worth unifying in v2.
//
// `setTimeout` / `clearTimeout` are reachable through `window` because
// Network.sync() calls `window.setTimeout(...)` for its (broken) throttle.

export function installGlobals() {
    if (globalThis.window) return;

    globalThis.window = {
        document: undefined,          // deliberately absent: keeps Legacy in headless mode
        addEventListener() {},        // required by gamepad.js (see note above)
        removeEventListener() {},
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        setInterval: globalThis.setInterval.bind(globalThis),
        clearInterval: globalThis.clearInterval.bind(globalThis)
    };
}

/** Let every pending macrotask (Legacy's setTimeout-based throttle) settle. */
export async function flushTimers(rounds = 3) {
    for (let i = 0; i < rounds; i++) {
        await new Promise(done => setTimeout(done, 0));
    }
}
