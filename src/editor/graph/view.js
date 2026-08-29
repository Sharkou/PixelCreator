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

import { OBJECT_TYPE, PortKind } from '../../core/mod.js';
import { carriesControl } from '../inspector/node.js';
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
 * A ROW IS A CONTROL PLUS THE THINNEST GAP THAT STILL SEPARATES TWO, and the second half of
 * that sentence is a correction. It was 22 — a control squeezed to 18 px — then 28, which
 * separated the fields and turned every node into a tower: a `Multiply` a third taller for
 * two sockets nobody was confusing. A canvas is read with dozens of nodes on it, so density
 * is not a saving here, it is legibility.
 *
 * 24 is `--px-control` (22) plus 2. The field stops being squeezed AND the node stops
 * growing: `Multiply` lands within six pixels of what it was before either change.
 */
export const ROW_HEIGHT = 24;

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
export const CONTROL_GAP = 2;

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
 *   takes the first row it can be the LABEL of, and makes a row of its own when there is
 *   none.**
 *
 * THE SECOND HALF USED TO READ "the first row that has none yet", AND THAT LOST A ROW'S
 * OTHER PROMISE — "a row says a thing once". A row carrying an object port is the one row a
 * control cannot speak for: an object socket has no field and can have none (ADR-0034 §3.2),
 * so its name is the only thing that says what it takes (`silencedPorts`). Dropping a param
 * there printed both, and `Set Property On` read `Object Property [x]` — one line saying two
 * things, which is the very defect ADR-0033 §1 was written against. Refusing that row is not
 * an exception to the algebra; it is the half of it that had not been written down.
 *
 * AND ONE MORE, WHICH IS THE HALF THE ZIP CANNOT STATE: **a node that consumes more values
 * than it produces puts what it produces BELOW everything it consumes.** Pairing an input
 * with an output on one line says the two are one thing seen from both sides — a literal
 * and the socket its content leaves by, a picker and the value it names. `Add` is not that:
 * `A` and `Result` are two different things, and printing them on one line made a creator
 * read `A … Result` / `B` and ask which of the two the result belonged to. Below its inputs,
 * a result reads as what it is — the thing computed FROM them, in the order arithmetic is
 * written in.
 *
 * IT IS DERIVED, NOT DECLARED, AND ONLY DATA IS COUNTED. Nothing in the catalogue says "I am
 * a reduction": the port lists already do, and a flag on twelve node types would be a second
 * table to keep in step with them (ADR-0033 §1). Flow ports keep their place in the zip
 * because execution is not a value — `Set Property`'s two triangles are one line, and moving
 * them apart would say a node's entry and its exit were different heights.
 *
 * That is the whole algebra. What it produces, without a single special case:
 *
 * | Node | Rows |
 * |---|---|
 * | `Number`, `Boolean`, `Text` | ONE — the field and the output socket, side by side |
 * | `Get Property` | Object, Component, Property — then the socket the value leaves by |
 * | `Set Property` | flow in / out, Object, Component, Property, then the value socket |
 * | `Add`, `Multiply`, `Equal`, `And` | A with its field, B with its field, then Result |
 * | `Not` | ONE — one value in, one out: the zip still says something true |
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

    // The results leave the zip when there are fewer of them than there are values going in;
    // the flow ports never do. Both lists keep their declared order.
    const results = reduces(inputs, outputs) || configured(inputs, outputs, controls)
        ? outputs.filter(isData)
        : [];
    const paired = results.length === 0 ? outputs : outputs.filter(port => !isData(port));

    const rows = [];
    for (let index = 0; index < Math.max(inputs.length, paired.length); index++) {
        rows.push({ input: inputs[index] ?? null, output: paired[index] ?? null, control: null });
    }
    // A RESULT ROW IS THE NODE'S ANSWER, AND ANSWERS COME LAST. It is marked as one so a
    // param cannot be placed on it: a question drawn across the answer is what made
    // `Get Property` read `Object [Self] … value` on line one, with the two pickers that
    // DECIDE that value underneath it (ADR-0045 §2).
    for (const result of results) rows.push({ input: null, output: result, control: null, result: true });

    // A control that edits a port goes to that port's row, wherever it is. Placed first, so
    // it cannot be displaced by a param that merely wanted "the next free row".
    const floating = [];
    for (const control of controls) {
        const row = control?.port ? rows.find(entry => entry.input?.id === control.port) : null;
        if (row && !row.control) row.control = control;
        else if (!control?.port) floating.push(control);
    }

    // A PARAM MAY SPEAK FOR AN OUTPUT ONLY WHEN THERE IS ONE OUTPUT TO SPEAK FOR. On a
    // literal the param IS what the single socket carries, which is what makes `Number` one
    // compact row. On a `Key`, three booleans leave by three sockets and the param is none
    // of them — sharing a row silenced `Is Down`'s label (`silencedPorts`), so the node's
    // first output had no name at all while the other two did.
    const speaksForOutput = outputs.filter(isData).length === 1;

    // WHERE A REFUSED PARAM GOES, AND THE ORDER IS THE SENTENCE. A node reads: when it runs,
    // WHAT it acts on, HOW it is configured, then the values that flow through it. So a param
    // that needs a row of its own lands after the row execution ENTERS by and after the row
    // naming the Object — and before the value rows, because a picker that decides a value's
    // TYPE must be read before that value (appending put it underneath, and a creator read
    // the node backwards).
    //
    // ENTERS BY, NOT "IS ABOUT EXECUTION". The measure used to be `isFlowRow()`, which is
    // true of a row carrying flow ports in EITHER direction — and an event node has nothing
    // but flow OUTPUTS. So `On Key` put its Key picker last, under `Pressed` and `Released`,
    // and the card read "these two things happen … about which key?". The two moments are
    // what the node PRODUCES once it knows the key, so the key is read first, exactly as
    // `Set Property` reads its Object before its value.
    let at = rows.findIndex(row => !entersFlow(row) && !namesTarget(row));
    if (at === -1) at = rows.length;

    for (const control of floating) {
        const labelled = rows.findIndex(row => !row.control && !row.result && canBeLabelled(row, speaksForOutput));
        if (labelled !== -1) {
            rows[labelled].control = control;
            continue;
        }

        rows.splice(at, 0, { input: null, output: null, control });
        at += 1;
    }

    return rows;
}

/**
 * Whether a row is the one saying WHICH Object the node acts on.
 *
 * It leads, just under the flow, because that is the order the sentence is read in: on THIS
 * Object, set THAT property, to this value. It is recognised by the port's type rather than
 * by a name, so a second node carrying a target is placed correctly without a word here.
 *
 * @param {{input: object|null}} row - The row
 * @returns {boolean} True when the row carries an Object input
 */
function namesTarget(row) {
    return row?.input?.kind === PortKind.DATA && row.input.type === OBJECT_TYPE;
}

/**
 * Whether a row is about execution and nothing else.
 *
 * A FLOW ROW TAKES NO CONTROL, and that is the half of the rule the geometry was missing.
 * `Set Property On` drew its Component picker between the two triangles that carry
 * execution, so the line that says "this runs, then that runs" also asked a question about
 * a Component — the reading order of the node broke at its first line. A flow port has no
 * name to lose, which is why the old rule let a control sit there; what it does have is a
 * meaning, and a dropdown across it is not that meaning.
 *
 * @param {{input: object|null, output: object|null}} row - The row
 * @returns {boolean} True when the row carries flow ports and no data port
 */
function isFlowRow(row) {
    const ports = [row?.input, row?.output].filter(Boolean);
    return ports.length > 0 && ports.every(port => port.kind === PortKind.FLOW);
}

/**
 * Whether execution ENTERS the node on this row.
 *
 * THE HALF OF `isFlowRow()` THAT DECIDES ORDER. A row a flow arrives on is the node's first
 * line by definition — nothing it is configured with can be read before "this runs". A row
 * a flow only LEAVES by is the opposite: it is what the node does once it is configured, so
 * a param belongs above it. `On Key` is the whole difference — two flow outputs, no input —
 * and reading it with `isFlowRow()` pushed its Key picker below both moments it starts.
 *
 * @param {{input: object|null}} row - The row
 * @returns {boolean} True when a flow port enters here
 */
function entersFlow(row) {
    return row?.input?.kind === PortKind.FLOW;
}

/**
 * Whether a port carries a value rather than execution order.
 *
 * A port that declares no kind is a data port, which is the rule `createPort()` applies —
 * stated here too because this module is also handed hand-written port lists by its tests
 * and by `hitTest()`'s callers, and a second answer to "is this a wire or a value" is the
 * kind of divergence ADR-0033 moved this arithmetic into one file to prevent.
 *
 * @param {object|null} port - The port
 * @returns {boolean} True for a data port
 */
function isData(port) {
    return Boolean(port) && port.kind !== PortKind.FLOW;
}

/**
 * Whether a node's outputs are the RESULT of its inputs rather than a counterpart to them.
 *
 * The measure is arity, and it is the only one available without asking a node type to
 * describe itself: a node that takes two values and gives one back has combined them, and
 * there is no input the single output belongs beside. One-for-one is left alone — `Not` and
 * `Parent` genuinely have a counterpart per input — and so is a node that produces more than
 * it consumes, where the zip is what gives every output a line.
 *
 * @param {object[]} inputs - The node's input ports
 * @param {object[]} outputs - The node's output ports
 * @returns {boolean} True when the outputs should follow every input row
 */
function reduces(inputs, outputs) {
    const produced = outputs.filter(isData).length;
    return produced > 0 && produced < inputs.filter(isData).length;
}

/**
 * Whether what a node produces comes from its CONFIGURATION rather than from its input.
 *
 * THE OTHER HALF OF `reduces()`, AND THE ONE THE ZIP COULD NOT SEE. `Get Property` takes one
 * value in and gives one out, so the arity test calls them counterparts and puts them on one
 * line — but the Object going in is not where the value comes from. The value comes from the
 * Component and the Property, which are params, and drawing the answer ABOVE the two
 * questions that decide it is the node read backwards (ADR-0045 §2).
 *
 * A node with no params of its own is left alone: `Parent` and `Is Valid` really do answer
 * about the Object handed to them, and one line is the truth there.
 *
 * @param {object[]} inputs - The node's input ports
 * @param {object[]} outputs - The node's output ports
 * @param {object[]} controls - The field descriptors, as `nodeRows()` takes them
 * @returns {boolean} True when the outputs belong below everything else
 */
function configured(inputs, outputs, controls) {
    if (outputs.filter(isData).length === 0 || inputs.filter(isData).length === 0) return false;
    return controls.some(control => !control?.port);
}

/**
 * Whether a control can stand as the whole of a row's label.
 *
 * ONE ANSWER, TWO READERS, and they must agree: this decides where a floating control MAY
 * land, and `silencedPorts()` decides what a control that landed silences. Written twice,
 * the two would drift and a label would be printed into a field — the failure ADR-0033 §1
 * moved this decision into the geometry to prevent.
 *
 * @param {{input: object|null, output: object|null}} row - The row
 * @param {boolean} speaksForOutput - Whether the node has a single data output, and a param
 *   may therefore stand as its name
 * @returns {boolean} True when nothing on the row has to speak for itself
 */
function canBeLabelled(row, speaksForOutput) {
    if (isFlowRow(row)) return false;
    if (namesItself(row?.input) || namesItself(row?.output)) return false;
    // An output it may not speak for is an output whose label it would take away.
    return !row?.output || speaksForOutput;
}

/**
 * Whether a port's own name is the only thing that can say what it carries.
 *
 * A DATA PORT THAT TAKES NO CONTROL HAS NOTHING ELSE ON ITS ROW TO DESCRIBE IT — an object
 * handle and an untyped `any` are exactly those (`carriesControl`, inspector/node.js), so
 * the label is all they have. Every other data port shows a field a creator reads instead,
 * and a flow port has no name to lose.
 *
 * @param {object|null} port - The port
 * @returns {boolean} True when its label must survive whatever shares its row
 */
function namesItself(port) {
    return port?.kind === PortKind.DATA && !carriesControl(port);
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
 * ONE PORT IS NEVER SPOKEN FOR BY A PARAM, AND IT IS THE ONE THAT CARRIES AN OBJECT — see
 * `namesItself()`. A param no longer LANDS on such a row either (`nodeRows`), so the two
 * halves now agree: the row a control cannot speak for is a row it is never given.
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

        if (row.input && !namesItself(row.input)) silenced.add(`in:${row.input.id}`);
        if (row.output && !namesItself(row.output)) silenced.add(`out:${row.output.id}`);
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

    // THREE WIDTHS, AND THE MIDDLE ONE IS THE ONE THAT WAS MISSING. A side with no port
    // gives the control everything; a side whose port label the control speaks for gives it
    // everything but the socket; a side that STILL PRINTS a label has to keep room for it —
    // without which `Add` drew its field straight through the word "Result" and left a
    // single letter showing.
    const room = (port, direction) => {
        if (!port) return CONTROL_INSET;
        if (!port.label || silenced.has(`${direction}:${port.id}`)) return CONTROL_PORT_INSET;
        return CONTROL_LABEL_INSET;
    };

    // ONE LEFT EDGE FOR THE WHOLE CARD (ADR-0046 §7). Each row used to be measured on its
    // own, so `Get Property` — whose first row carries an Object socket and whose next two
    // do not — drew three controls starting at two different x. Eight pixels is not much
    // to see and it is exactly enough to read as ragged, because a column of fields is read
    // down its left edge.
    //
    // THE RIGHT EDGE IS STILL EACH ROW'S OWN, and that is not an inconsistency: a port that
    // PRINTS its label really does occupy that space, and forcing every row to the widest
    // of those would take thirty pixels from fields that have none to spare in a 176 px
    // card. The left edge costs at most eight and buys the column.
    const inset = rows.reduce(
        (widest, row) => (row.control ? Math.max(widest, room(row.input, 'in')) : widest),
        CONTROL_INSET
    );

    rows.forEach((row, index) => {
        if (!row.control) return;

        const right = room(row.output, 'out');

        boxes.push({
            index,
            control: row.control,
            x: node.x + inset,
            y: node.y + HEADER_HEIGHT + PORT_PADDING + index * ROW_HEIGHT + CONTROL_GAP / 2,
            width: NODE_WIDTH - inset - right,
            height: ROW_HEIGHT - CONTROL_GAP
        });
    });

    return boxes;
}

/**
 * Every port of a node with its position, ready to draw or to pick.
 *
 * A PORT SITS ON ITS ROW, NOT AT ITS INDEX — and the difference is the whole reason this
 * takes the controls. It used to place a port at `index * ROW_HEIGHT` within its own side's
 * list, which is the same answer as the rows only while the rows are a plain zip of inputs
 * and outputs. The moment a control takes a line of its own the two disagree, and they
 * disagreed silently: the labels moved with the rows, the sockets stayed at their old
 * heights, and `Set Property On` drew "Object" through its property picker while its wires
 * left from the wrong dots.
 *
 * That was ADR-0033 §1's second opinion, hiding in plain sight: a node IS its rows, so where
 * anything on it sits is a question only `nodeRows()` may answer. The controls are what the
 * rows are computed from, so they are what this needs — the same pair `nodeSize()` already
 * takes, for the same reason.
 *
 * @param {object} node - The node record
 * @param {{inputs: object[], outputs: object[]}} ports - Its ports
 * @param {object[]} [controls] - Field descriptors, as `nodeRows()` takes them
 * @returns {Array<{port: object, direction: string, x: number, y: number}>} Placed ports
 */
export function placePorts(node, ports, controls = []) {
    const placed = [];

    nodeRows(ports, controls).forEach((row, index) => {
        const y = node.y + HEADER_HEIGHT + PORT_PADDING + index * ROW_HEIGHT + ROW_HEIGHT / 2;
        if (row.input) placed.push({ port: row.input, direction: 'in', x: node.x + PORT_INSET, y });
        if (row.output) {
            placed.push({ port: row.output, direction: 'out', x: node.x + NODE_WIDTH - PORT_INSET, y });
        }
    });

    return placed;
}

/**
 * Where one port sits, in graph space.
 *
 * @param {object} node - The node record, carrying its position
 * @param {{inputs: object[], outputs: object[]}} ports - Its ports
 * @param {string} direction - 'in' or 'out'
 * @param {string} portId - The port's identifier
 * @param {object[]} [controls] - Field descriptors, so the port lands on its real row
 * @returns {{x: number, y: number}|null} Its centre, or null when the node has no such port
 */
export function portPosition(node, ports, direction, portId, controls = []) {
    const placed = placePorts(node, ports, controls)
        .find(entry => entry.direction === direction && entry.port.id === portId);

    return placed ? { x: placed.x, y: placed.y } : null;
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
        const { node, ports, controls } = layout[index];

        for (const placed of placePorts(node, ports, controls ?? [])) {
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
 * The rectangle two corners make, however they are ordered.
 *
 * A DRAG HAS NO DIRECTION, AND A RECTANGLE DOES. A creator sweeping up and to the left
 * produces a negative width; every consumer of a box would then have to remember to
 * normalise, and the one that forgot would select nothing while showing a rubber band.
 *
 * @param {{x: number, y: number}} from - Where the gesture started, in graph space
 * @param {{x: number, y: number}} to - Where the pointer is now
 * @returns {{x: number, y: number, width: number, height: number}} The box
 */
export function rectBetween(from, to) {
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    return { x, y, width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
}

/**
 * The nodes a rectangle catches.
 *
 * TOUCHED, NOT ENCLOSED. A band has to catch what it crosses: asking a creator to draw
 * around a node that is 176 units wide means starting the sweep off-screen whenever two
 * nodes sit side by side, and every node editor that requires full containment is the one
 * people complain about. Overlap is also what makes a small deliberate flick — a band drawn
 * across three nodes' corners — mean what it looks like it means.
 *
 * IT SHARES `nodeSize()` WITH THE RENDERER AND WITH `hitTest()`, so a node is caught over
 * exactly the box a creator can see and click. A second idea of how big a node is would
 * select things the band never touched.
 *
 * @param {Array<{node: object, ports: object, controls: object[]}>} layout - As `hitTest()`
 *   takes it
 * @param {{x: number, y: number, width: number, height: number}} rect - The band, in graph
 *   space
 * @returns {object[]} The node records it catches, in layout order
 */
export function nodesIn(layout, rect) {
    if (!rect) return [];

    return layout
        .filter(({ node, ports, controls }) => {
            const size = nodeSize(ports, controls ?? []);
            return node.x <= rect.x + rect.width
                && node.x + size.width >= rect.x
                && node.y <= rect.y + rect.height
                && node.y + size.height >= rect.y;
        })
        .map(entry => entry.node);
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
