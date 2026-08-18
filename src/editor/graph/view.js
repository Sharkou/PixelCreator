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

import { MAJOR_EVERY, adaptiveSpacing } from '../grid.js';

/** A node's box, in graph units. Wide enough for two port labels, a control and a title. */
export const NODE_WIDTH = 176;

/** The title bar of a node. */
export const HEADER_HEIGHT = 26;

/**
 * One row of a node's body.
 *
 * A ROW IS THE UNIT, AND THAT IS THE WHOLE IDEA (ADR-0033). A node used to have two
 * stacked zones — port rows on top, a strip of editable params underneath — so a `Number`
 * node showed its output socket on one line and the value that comes OUT of it on another,
 * and `Set Property` put the socket that feeds a property four pixels away from the field
 * that would feed it instead. A row carries an input port, an output port and the control
 * that edits one of them, so the thing and the socket it travels through are on the same
 * line by construction rather than by tuning.
 *
 * Tall enough to hold a text field: a 20 px port row is not a box you can type in.
 */
export const ROW_HEIGHT = 22;

/** Space between the header and the first row, and after the last one. */
export const PORT_PADDING = 8;

/**
 * Kept as the distance between two rows.
 *
 * The name survives because it is what the rest of the Editor calls this measure; it is
 * now simply `ROW_HEIGHT`, because a port and the control beside it share a line.
 */
export const PORT_SPACING = ROW_HEIGHT;

/** How far a port's centre sits from the node's edge. */
export const PORT_INSET = 0;

/** The radius a port is drawn — and picked — at. */
export const PORT_RADIUS = 5;

/** How close a pointer must be to a port to be treated as on it. */
export const PORT_HIT_RADIUS = 11;

/** Vertical space taken out of a row so two controls do not touch. */
export const CONTROL_GAP = 4;

/** How far a control is inset from the node's edge when no port shares its side. */
export const CONTROL_INSET = 8;

/** How far a control is inset when a port sits on that side of the row. */
export const CONTROL_PORT_INSET = 16;

/** How far a control is inset when a port sits there AND still prints its label. */
export const CONTROL_LABEL_INSET = 46;

/** Node positions snap to this, so a graph a creator dragged still looks arranged. */
export const GRID = 8;

/**
 * How many fine grid lines make one emphasised line.
 *
 * Re-exported from `editor/grid.js` rather than declared again: the scene and the canvas
 * are both infinite planes, so they draw the same grid rather than two that resemble each
 * other (ADR-0028 draws the same conclusion about feedback).
 */
export { MAJOR_EVERY };

/** How far the view may be zoomed. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

/**
 * The rows a node's body is made of.
 *
 * ONE RULE, AND EVERY LAYOUT BELOW FALLS OUT OF IT:
 *
 *   **a control belongs to the row of the port it edits; a control that edits no port
 *   takes the first row that has none yet, and makes a new row when there is none left.**
 *
 * That is the whole algebra. What it produces, without a single special case:
 *
 * | Node | Rows |
 * |---|---|
 * | `Number`, `Boolean`, `Text` | ONE — the field and the output socket, side by side |
 * | `Get Property` | ONE — the property picker, and the socket that carries its value |
 * | `Set Property` | flow in / picker / flow out, then the value socket beside its field |
 * | `Add` | A with its field and Result, then B with its field |
 * | `Branch` | flow in / true, then the condition beside its checkbox / false |
 *
 * WHY IT MATTERS BEYOND TIDINESS. A creator reads a graph by following a value into a
 * socket. When the value is on one line and the socket on another, the node stops saying
 * which of its sockets that value goes into — which is exactly what a visual language is
 * for. Two stacked zones made that impossible to fix by nudging pixels.
 *
 * @param {{inputs: object[], outputs: object[]}} ports - The node's ports
 * @param {object[]} [controls] - Field descriptors; `port` names the input port one edits
 * @returns {Array<{input: object|null, output: object|null, control: object|null}>} The rows
 */
export function nodeRows(ports, controls = []) {
    const inputs = ports?.inputs ?? [];
    const outputs = ports?.outputs ?? [];

    const rows = [];
    for (let index = 0; index < Math.max(inputs.length, outputs.length); index++) {
        rows.push({ input: inputs[index] ?? null, output: outputs[index] ?? null, control: null });
    }

    // A control that edits a port goes to that port's row, wherever it is. Placed first, so
    // it cannot be displaced by a param that merely wanted "the next free row".
    const floating = [];
    for (const control of controls) {
        const row = control?.port ? rows.find(entry => entry.input?.id === control.port) : null;
        if (row && !row.control) row.control = control;
        else if (!control?.port) floating.push(control);
    }

    for (const control of floating) {
        const free = rows.find(entry => !entry.control);
        if (free) free.control = control;
        else rows.push({ input: null, output: null, control });
    }

    return rows;
}

/**
 * How big a node is, given the ports and the controls it currently has.
 *
 * @param {{inputs: object[], outputs: object[]}} ports - The node's ports
 * @param {object[]} [controls] - Field descriptors, as `nodeRows()` takes them
 * @returns {{width: number, height: number}} Its box, in graph units
 */
export function nodeSize(ports, controls = []) {
    const rows = nodeRows(ports, controls).length;

    return {
        width: NODE_WIDTH,
        // A node with no rows at all is still a card, not a sliver: the header plus its
        // padding is the smallest thing that reads as an object on the canvas.
        height: HEADER_HEIGHT + PORT_PADDING * 2 + rows * ROW_HEIGHT
    };
}

/**
 * Which port labels a row's controls replace.
 *
 * A CONTROL IS ITS ROW'S LABEL, and a row says a thing once. Two cases, one sentence:
 *
 * - a control that edits a port replaces THAT port's label — the field is what the socket
 *   carries, and `A  [0]  A` is the same word twice on a 176 px card;
 * - a control that edits no port — a param — replaces the labels of the ports sharing its
 *   row, because the param IS what the row is about. A `Number` node is a field and the
 *   socket its content leaves by; "Value" printed beside both is noise.
 *
 * IT LIVES HERE, WITH THE GEOMETRY, because the answer decides two things that must agree:
 * whether the renderer draws a label, and how much room `controlBoxes()` leaves for one. A
 * renderer that decided on its own would eventually print a label into a field.
 *
 * @param {Array<object>} rows - The rows, from `nodeRows()`
 * @returns {Set<string>} `in:portId` / `out:portId` for every label a control speaks for
 */
export function silencedPorts(rows) {
    const silenced = new Set();

    for (const row of rows ?? []) {
        if (!row.control) continue;

        if (row.control.port) {
            silenced.add(`in:${row.control.port}`);
            continue;
        }

        if (row.input) silenced.add(`in:${row.input.id}`);
        if (row.output) silenced.add(`out:${row.output.id}`);
    }

    return silenced;
}

/**
 * Where each row's control goes, in graph space.
 *
 * A control shares its row with whatever ports are on it, so it is inset further on a side
 * that carries a socket — the socket and its label need the room, and a field that ran
 * under them would be a field a creator cannot see the end of.
 *
 * @param {object} node - The node record, carrying its position
 * @param {Array<object>} rows - The rows, from `nodeRows()`
 * @returns {Array<{index: number, x: number, y: number, width: number, height: number, control: object}>}
 *   One box per row that has a control, in row order
 */
export function controlBoxes(node, rows) {
    const boxes = [];

    const silenced = silencedPorts(rows);

    rows.forEach((row, index) => {
        if (!row.control) return;

        // THREE WIDTHS, AND THE MIDDLE ONE IS THE ONE THAT WAS MISSING. A side with no port
        // gives the control everything; a side whose port label the control speaks for
        // gives it everything but the socket; a side that STILL PRINTS a label has to keep
        // room for it — without which `Add` drew its field straight through the word
        // "Result" and left a single letter showing.
        const room = (port, direction) => {
            if (!port) return CONTROL_INSET;
            if (!port.label || silenced.has(`${direction}:${port.id}`)) return CONTROL_PORT_INSET;
            return CONTROL_LABEL_INSET;
        };

        const left = room(row.input, 'in');
        const right = room(row.output, 'out');

        boxes.push({
            index,
            control: row.control,
            x: node.x + left,
            y: node.y + HEADER_HEIGHT + PORT_PADDING + index * ROW_HEIGHT + CONTROL_GAP / 2,
            width: NODE_WIDTH - left - right,
            height: ROW_HEIGHT - CONTROL_GAP
        });
    });

    return boxes;
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
        y: node.y + HEADER_HEIGHT + PORT_PADDING + index * ROW_HEIGHT + ROW_HEIGHT / 2
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
 * @param {Array<{node: object, ports: object, controls: object[]}>} layout - Nodes with
 *   their resolved ports and controls, topmost last, as the renderer draws them
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
        const { node, ports, controls } = layout[index];
        const size = nodeSize(ports, controls ?? []);

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

    for (const { node, ports, controls } of layout) {
        const size = nodeSize(ports, controls ?? []);
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

/**
 * The grid to draw, in SCREEN pixels, for a given view.
 *
 * WHY SCREEN PIXELS AND NOT GRAPH UNITS. An SVG pattern tiles in the coordinate system of
 * the element that references it, and the element that has to be covered is the viewport —
 * it is the one rectangle that is always the whole canvas whatever the pan. So the pattern
 * is measured on screen and carries the pan as a translation, which is one transform on one
 * element instead of a transform per pattern.
 *
 * THE BUG THIS REPLACES, and it is worth naming because it looked like a rendering glitch
 * rather than an arithmetic one: the fine grid used to be a pattern nested INSIDE the
 * emphasised one, and both carried the view transform. A nested pattern paints in the
 * coordinate system of the tile that references it — a system the outer transform has
 * already moved — so the fine lines were transformed twice. They panned at double speed and
 * scaled quadratically against the lines they were supposed to subdivide, which reads as
 * the grid tearing itself in half. Two sibling rectangles have no nesting and therefore no
 * second transform.
 *
 * THE SPACING ADAPTS, by the same law the Viewport obeys (editor/grid.js): a fixed spacing
 * is fog at 0.25× and three lines at 2.5×, and a creator who pans between the two surfaces
 * must not find two different ideas of what a plane looks like.
 *
 * NO DEVICE-PIXEL TERM HERE, unlike the Viewport's. A canvas element is measured in device
 * pixels and its grid has to divide that back out; an SVG is laid out in CSS pixels, so the
 * zoom already IS CSS pixels per graph unit. Passing a density in would make the grid half
 * as dense on a 2x display for the same view — the very thing the Viewport divides it out
 * to avoid.
 *
 * @param {{x: number, y: number, zoom: number}} view - The pan and zoom
 * @returns {{spacing: number, minor: number, major: number, x: number, y: number}}
 *   The spacing in graph units, the two tile sizes in screen pixels, and the pan
 */
export function gridSpec(view) {
    const zoom = view?.zoom > 0 ? view.zoom : 1;
    const spacing = adaptiveSpacing(GRID, zoom);
    const minor = spacing * zoom;

    return {
        spacing,
        minor,
        major: minor * MAJOR_EVERY,
        x: view?.x ?? 0,
        y: view?.y ?? 0
    };
}

function round(value) {
    return Math.round(value * 100) / 100;
}
