// The renderer contract.
//
// Nothing outside a backend knows how pixels are produced. A component receives a
// renderer and calls these operations; whether they end up in a Canvas 2D context, a
// WebGL command buffer or a WebGPU render pass is the backend's business alone.
//
// There is no base class to extend, for the same reason components have none
// (ADR-0004): duck typing keeps a backend a plain object with these methods, and keeps
// a test double a twenty-line literal. The contract lives here, in one place, as the
// documentation a backend implements.
//
// The operation set is deliberately small — it is exactly what the components shipped
// in this step need, no more. A command list, batching, materials or render passes are
// not here because nothing needs them yet.
//
// COORDINATES. Every primitive takes coordinates in the *current transform's* space,
// with the origin where the transform puts it. Primitives are dumb: a component that
// wants to draw itself centred passes -width / 2, the renderer does not guess.
//
// @typedef {object} Renderer
//
// @property {(color?: string) => void} clear
//     Clear the surface, optionally filling it with a colour first.
//
// @property {() => void} save
//     Push the current transform and blend mode.
//
// @property {() => void} restore
//     Pop them back.
//
// @property {(matrix: Matrix) => void} setTransform
//     Replace the current transform with an absolute one.
//
// @property {(mode: 'normal'|'additive') => void} setBlendMode
//     Choose how what is drawn combines with what is already there. 'additive' is what
//     makes light and particles glow; every backend can express both.
//
// @property {(x, y, width, height, options?) => void} fillRect
// @property {(x, y, width, height, options?) => void} strokeRect
// @property {(x, y, radius, options?) => void} fillCircle
// @property {(image, x, y, width, height, options?) => void} drawImage
//
// Drawing options are `{ color, alpha, lineWidth }`, all optional. A backend applies
// what it understands and ignores the rest.

export const BlendMode = {
    NORMAL: 'normal',
    ADDITIVE: 'additive'
};

/** Methods a backend must provide to satisfy the contract. */
export const RENDERER_OPERATIONS = globalThis.Object.freeze([
    'clear',
    'save',
    'restore',
    'setTransform',
    'setBlendMode',
    'fillRect',
    'strokeRect',
    'fillCircle',
    'drawImage'
]);

/**
 * Check that a value implements the renderer contract.
 *
 * Cheap insurance against a typo in a backend or a test double, since duck typing
 * would otherwise fail much later and much less clearly.
 *
 * @param {object} renderer - The candidate backend
 * @returns {string[]} The missing operation names, empty when the contract is satisfied
 */
export function missingOperations(renderer) {
    if (!renderer || typeof renderer !== 'object') return [...RENDERER_OPERATIONS];
    return RENDERER_OPERATIONS.filter(name => typeof renderer[name] !== 'function');
}

/**
 * Throw unless a value implements the renderer contract.
 * @param {object} renderer - The candidate backend
 * @returns {object} The renderer, unchanged
 */
export function assertRenderer(renderer) {
    const missing = missingOperations(renderer);
    if (missing.length > 0) {
        throw new TypeError(`Renderer is missing required operations: ${missing.join(', ')}`);
    }
    return renderer;
}
