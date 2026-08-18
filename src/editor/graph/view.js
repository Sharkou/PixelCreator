// Where things are on the graph canvas — geometry, and nothing else (ADR-0027).
//
// THE MIDDLE OF THE THREE LAYERS:
//
//   graph model        core/graph/, which knows nothing about pixels
//        ↓
//   graph view         THIS FILE — where a node's box is, where a port sits, what curve
//                      joins two of them, and what is under the pointer
//        ↓
//   graph renderer     windows/graph.js, which turns those numbers into SVG
//
// IT TOUCHES NO DOM, and that is the point: the hard part of a node editor is the
// arithmetic — a port that drifts two pixels from the wire that reaches it is a bug you
// cannot write a browser test for, and can write a Node one for in three lines. Legacy had
// no such layer: a connector's position was `getBoundingClientRect()` on a live element, so
// it could only be known while it was on screen, and the curve was recomputed from the DOM
// on every mouse move.
//
// COORDINATES. Everything here is in GRAPH SPACE — the space node positions are stored in.
// Pan and zoom are a view transform applied on the way to the screen, and `toGraph()` /
// `toScreen()` are the only two functions that cross between the two. Node coordinates are
// never rewritten by a zoom, which is the mistake that makes a graph editor lose its
// layout.

/** A node's box, in graph units. Wide enough for two port labels and a title. */
export const NODE_WIDTH = 168;

/** The title bar of a node. */
export const HEADER_HEIGHT = 26;

/** Vertical distance between two ports on the same side. */
export const PORT_SPACING = 20;

/** Space between the header and the first port, and after the last one. */
export const PORT_PADDING = 10;

/** How far a port's centre sits from the node's edge. */
export const PORT_INSET = 0;

/** The radius a port is drawn — and picked — at. */
export const PORT_RADIUS = 5;

/** How close a pointer must be to a port to be treated as on it. */
export const PORT_HIT_RADIUS = 11;

/** One row of a node's editable params, including the gap under it. */
export const PARAM_HEIGHT = 22;

/** Space between two param rows, taken out of the row above. */
export const PARAM_GAP = 4;

/** How far a param row is inset from the node's edge. */
export const PARAM_INSET = 8;

/** Space between the last port and the first param. */
export const PARAM_PADDING = 4;

/** Node positions snap to this, so a graph a creator dragged still looks arranged. */
export const GRID = 8;

/**
 * How many fine grid lines make one emphasised line.
 *
 * The same ratio `viewport/grid.js` uses, and deliberately: the scene and the canvas are
 * both infinite planes, so they draw the same grid rather than two that resemble each
 * other (ADR-0028 draws the same conclusion about feedback).
 */
export const MAJOR_EVERY = 4;

/** How far the view may be zoomed. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

/**
 * How big a node is, given the ports it currently has.
 *
 * Ports are laid out as rows, inputs on the left and outputs on the right, so a node with
 * three inputs and one output is three rows tall. It keeps `Branch` — one flow in, one
 * value in, two flows out — compact rather than twice as tall as it needs to be.
 *
 * @param {{inputs: object[], outputs: object[]}} ports - The node's ports
 * @returns {{width: number, height: number}} Its box, in graph units
 */
export function nodeSize(ports, params = 0) {
    const rows = Math.max(ports.inputs.length, ports.outputs.length);
    return {
        width: NODE_WIDTH,
        height: HEADER_HEIGHT
            + PORT_PADDING * 2
            + Math.max(0, rows - 1) * PORT_SPACING
            + (rows > 0 ? PORT_SPACING : 0)
            // A node that carries params grows a strip under its ports to hold them. It
            // is the node's own body, not a row of ports, so it has its own height —
            // a field needs to be typed into, and a 20 px port row is not a text box.
            + (params > 0 ? params * PARAM_HEIGHT + PARAM_PADDING : 0)
    };
}

/**
 * Where a node's editable params sit, in graph space.
 *
 * @param {object} node - The node record, carrying its position
 * @param {{inputs: object[], outputs: object[]}} ports - Its ports
 * @param {number} count - How many params it draws
 * @returns {Array<{index: number, x: number, y: number, width: number, height: number}>}
 *   One box per param, in order
 */
export function paramBoxes(node, ports, count) {
    if (count <= 0) return [];

    const rows = Math.max(ports.inputs.length, ports.outputs.length);
    const top = node.y + HEADER_HEIGHT + PORT_PADDING * 2
        + Math.max(0, rows - 1) * PORT_SPACING + (rows > 0 ? PORT_SPACING : 0);

    return Array.from({ length: count }, (_, index) => ({
        index,
        x: node.x + PARAM_INSET,
        y: top + index * PARAM_HEIGHT,
        width: NODE_WIDTH - PARAM_INSET * 2,
        height: PARAM_HEIGHT - PARAM_GAP
    }));
}

/**
 * Where one port sits, in graph space.
 *
 * @param {object} node - The node record, carrying its position
 * @param {{inputs: object[], outputs: object[]}} ports - Its ports
 * @param {string} direction - 'in' or 'out'
 * @param {string} portId - The port's identifier
 * @returns {{x: number, y: number}|null} Its centre, or null when the node has no such port
 */
export function portPosition(node, ports, direction, portId) {
    const side = direction === 'in' ? ports.inputs : ports.outputs;
    const index = side.findIndex(port => port.id === portId);
    if (index === -1) return null;

    return {
        x: node.x + (direction === 'in' ? PORT_INSET : NODE_WIDTH - PORT_INSET),
        y: node.y + HEADER_HEIGHT + PORT_PADDING + index * PORT_SPACING + PORT_SPACING / 2
    };
}

/**
 * Every port of a node with its position, ready to draw or to pick.
 *
 * @param {object} node - The node record
 * @param {{inputs: object[], outputs: object[]}} ports - Its ports
 * @returns {Array<{port: object, direction: string, x: number, y: number}>} Placed ports
 */
export function placePorts(node, ports) {
    const placed = [];

    for (const [direction, side] of [['in', ports.inputs], ['out', ports.outputs]]) {
        for (const port of side) {
            const at = portPosition(node, ports, direction, port.id);
            if (at) placed.push({ port, direction, x: at.x, y: at.y });
        }
    }

    return placed;
}

/**
 * The curve joining two points, as an SVG path.
 *
 * A HORIZONTAL BEZIER, and the offset grows with the distance — the one piece of Legacy's
 * graph worth keeping verbatim, because it is what makes a long wire read as a cable rather
 * than as a diagonal line. The floor keeps two ports an inch apart from producing a kink.
 *
 * @param {{x: number, y: number}} from - The output end
 * @param {{x: number, y: number}} to - The input end
 * @returns {string} The `d` attribute of a path
 */
export function connectionPath(from, to) {
    const distance = Math.abs(to.x - from.x);
    const offset = Math.max(40, distance * 0.4);

    return `M ${round(from.x)} ${round(from.y)} `
        + `C ${round(from.x + offset)} ${round(from.y)}, `
        + `${round(to.x - offset)} ${round(to.y)}, `
        + `${round(to.x)} ${round(to.y)}`;
}

/**
 * A point in screen coordinates, in graph space.
 *
 * @param {{x: number, y: number}} point - Screen coordinates, relative to the canvas
 * @param {{x: number, y: number, zoom: number}} view - The pan and zoom
 * @returns {{x: number, y: number}} The same point, in graph space
 */
export function toGraph(point, view) {
    return {
        x: (point.x - view.x) / view.zoom,
        y: (point.y - view.y) / view.zoom
    };
}

/**
 * A point in graph space, in screen coordinates.
 * @param {{x: number, y: number}} point - Graph coordinates
 * @param {{x: number, y: number, zoom: number}} view - The pan and zoom
 * @returns {{x: number, y: number}} The same point, on screen
 */
export function toScreen(point, view) {
    return {
        x: point.x * view.zoom + view.x,
        y: point.y * view.zoom + view.y
    };
}

/**
 * Zoom about a point, so what is under the pointer stays under it.
 *
 * The behaviour a creator expects from every canvas they have used, and the one thing a
 * naive `zoom *= factor` gets wrong: without the pan correction the graph slides away from
 * the cursor as it grows.
 *
 * @param {{x: number, y: number, zoom: number}} view - The current view
 * @param {number} factor - What to multiply the zoom by
 * @param {{x: number, y: number}} anchor - The screen point to hold fixed
 * @returns {{x: number, y: number, zoom: number}} The new view
 */
export function zoomAt(view, factor, anchor) {
    const zoom = clampZoom(view.zoom * factor);
    if (zoom === view.zoom) return view;

    const ratio = zoom / view.zoom;
    return {
        zoom,
        x: anchor.x - (anchor.x - view.x) * ratio,
        y: anchor.y - (anchor.y - view.y) * ratio
    };
}

/**
 * A zoom level within the bounds.
 * @param {number} zoom - The wanted zoom
 * @returns {number} The zoom, clamped
 */
export function clampZoom(zoom) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * A position snapped to the grid.
 * @param {number} value - A coordinate in graph space
 * @returns {number} The nearest grid line
 */
export function snap(value) {
    return Math.round(value / GRID) * GRID;
}

/**
 * What is under a point in graph space.
 *
 * Ports first, then nodes, then nothing — because a port sits on a node's edge and a
 * creator aiming at a port has aimed at a node too. The order IS the rule, and having it
 * here rather than in an event handler is what makes it testable.
 *
 * @param {Array<{node: object, ports: object}>} layout - Nodes with their resolved ports,
 *   topmost last, as the renderer draws them
 * @param {{x: number, y: number}} point - Where the pointer is, in graph space
 * @returns {{kind: string, node?: object, port?: object, direction?: string}} What was hit
 */
export function hitTest(layout, point) {
    // Reversed: what is drawn last is on top, so it is picked first.
    for (let index = layout.length - 1; index >= 0; index--) {
        const { node, ports } = layout[index];

        for (const placed of placePorts(node, ports)) {
            const dx = placed.x - point.x;
            const dy = placed.y - point.y;
            if (dx * dx + dy * dy <= PORT_HIT_RADIUS * PORT_HIT_RADIUS) {
                return { kind: 'port', node, port: placed.port, direction: placed.direction };
            }
        }
    }

    for (let index = layout.length - 1; index >= 0; index--) {
        const { node, ports, params } = layout[index];
        const size = nodeSize(ports, params?.length ?? 0);

        if (point.x >= node.x && point.x <= node.x + size.width
            && point.y >= node.y && point.y <= node.y + size.height) {
            const header = point.y <= node.y + HEADER_HEIGHT;
            return { kind: 'node', node, header };
        }
    }

    return { kind: 'canvas' };
}

/**
 * The box every node in a layout fits inside, or null when there are none.
 *
 * @param {Array<{node: object, ports: object}>} layout - Nodes with their resolved ports
 * @returns {{x: number, y: number, width: number, height: number}|null} The bounds
 */
export function graphBounds(layout) {
    if (layout.length === 0) return null;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const { node, ports, params } of layout) {
        const size = nodeSize(ports, params?.length ?? 0);
        left = Math.min(left, node.x);
        top = Math.min(top, node.y);
        right = Math.max(right, node.x + size.width);
        bottom = Math.max(bottom, node.y + size.height);
    }

    return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The view that fits a layout inside a viewport.
 *
 * @param {Array<{node: object, ports: object}>} layout - Nodes with their resolved ports
 * @param {{width: number, height: number}} viewport - The canvas, in screen pixels
 * @param {number} [margin] - Space to leave around the content, in screen pixels
 * @returns {{x: number, y: number, zoom: number}} The view
 */
export function fitView(layout, viewport, margin = 48) {
    const bounds = graphBounds(layout);
    if (!bounds || viewport.width <= 0 || viewport.height <= 0) return { x: 0, y: 0, zoom: 1 };

    const zoom = clampZoom(Math.min(
        (viewport.width - margin * 2) / Math.max(1, bounds.width),
        (viewport.height - margin * 2) / Math.max(1, bounds.height)
    ));

    return {
        zoom,
        x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
        y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom
    };
}

function round(value) {
    return Math.round(value * 100) / 100;
}
