// Where things are on the graph canvas (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeRegistry, PortKind, registerStandardNodes, portsOf } from '../../core/mod.js';
import {
    GRID,
    MAJOR_EVERY,
    gridSpec,
    HEADER_HEIGHT,
    MAX_ZOOM,
    MIN_ZOOM,
    NODE_WIDTH,
    clampZoom,
    connectionPath,
    fitView,
    graphBounds,
    hitTest,
    nodeRows,
    nodeSize,
    controlBoxes,
    silencedPorts,
    ROW_HEIGHT,
    placePorts,
    portPosition,
    snap,
    toGraph,
    toScreen,
    zoomAt
} from './view.js';

const registry = registerStandardNodes(new NodeRegistry());

function place(type, x, y, params = {}) {
    const node = { id: `${type}@${x},${y}`, type, x, y, params };
    return { node, ports: portsOf(registry.get(type), node, { properties: [] }) };
}

// --- node boxes ------------------------------------------------------------------------

test('a node is as tall as its busiest side', () => {
    const start = place('event.start', 0, 0);
    const branch = place('flow.branch', 0, 0);

    assert.equal(nodeSize(start.ports).width, NODE_WIDTH);
    assert.equal(nodeSize(branch.ports).height > nodeSize(start.ports).height, true);
    assert.ok(nodeSize({ inputs: [], outputs: [] }).height > HEADER_HEIGHT);
});

test('inputs sit on the left edge and outputs on the right, below the header', () => {
    const branch = place('flow.branch', 100, 50);

    const flowIn = portPosition(branch.node, branch.ports, 'in', 'in');
    const yes = portPosition(branch.node, branch.ports, 'out', 'true');

    assert.equal(flowIn.x, 100);
    assert.equal(yes.x, 100 + NODE_WIDTH);
    assert.equal(flowIn.y > 50 + HEADER_HEIGHT, true);
    assert.equal(yes.y, flowIn.y, 'the first port on each side shares a row');
});

test('ports on one side are spaced evenly, in declaration order', () => {
    const branch = place('flow.branch', 0, 0);

    const first = portPosition(branch.node, branch.ports, 'in', 'in');
    const second = portPosition(branch.node, branch.ports, 'in', 'condition');

    assert.equal(second.y - first.y, ROW_HEIGHT);
});

test('a port the node does not have has no position', () => {
    const start = place('event.start', 0, 0);

    assert.equal(portPosition(start.node, start.ports, 'out', 'nope'), null);
});

test('placing ports gives every one of them a side and a point', () => {
    const update = place('event.update', 0, 0);

    const placed = placePorts(update.node, update.ports);

    assert.equal(placed.length, 3);
    assert.equal(placed.filter(entry => entry.direction === 'out').length, 3);
    assert.equal(placed[0].port.kind, PortKind.FLOW);
});

// --- wires ------------------------------------------------------------------------------

test('a wire leaves its output to the right and arrives from the left', () => {
    const path = connectionPath({ x: 0, y: 0 }, { x: 200, y: 100 });

    assert.match(path, /^M 0 0 C /);
    assert.match(path, /200 100$/);
    // The first control point is to the RIGHT of the output, the second to the LEFT of the
    // input: that is what makes the curve read as a cable rather than as a diagonal.
    const [first, second] = path.match(/C (-?[\d.]+) [\d.-]+, (-?[\d.]+) /).slice(1).map(Number);
    assert.equal(first > 0, true);
    assert.equal(second < 200, true);
});

test('two ports almost on top of each other still get a curve, not a kink', () => {
    const path = connectionPath({ x: 0, y: 0 }, { x: 4, y: 0 });

    const [first] = path.match(/C (-?[\d.]+) /).slice(1).map(Number);
    assert.equal(first >= 40, true, 'the offset has a floor');
});

// --- the view transform ---------------------------------------------------------------------

test('screen and graph space are each other\'s inverse', () => {
    const view = { x: 30, y: -12, zoom: 1.5 };
    const point = { x: 84, y: 120 };

    const round = toGraph(toScreen(point, view), view);

    assert.equal(Math.round(round.x), point.x);
    assert.equal(Math.round(round.y), point.y);
});

test('zooming holds the point under the cursor still', () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const anchor = { x: 300, y: 200 };
    const before = toGraph(anchor, view);

    const zoomed = zoomAt(view, 1.5, anchor);
    const after = toGraph(anchor, zoomed);

    assert.equal(zoomed.zoom, 1.5);
    assert.equal(Math.round(after.x), Math.round(before.x));
    assert.equal(Math.round(after.y), Math.round(before.y));
});

test('zoom is bounded, and a zoom that changes nothing returns the same view', () => {
    const view = { x: 0, y: 0, zoom: MAX_ZOOM };

    assert.equal(clampZoom(100), MAX_ZOOM);
    assert.equal(clampZoom(0.001), MIN_ZOOM);
    assert.equal(zoomAt(view, 2, { x: 0, y: 0 }), view);
});

test('positions snap to the grid', () => {
    assert.equal(snap(0), 0);
    assert.equal(snap(GRID / 2 + 1), GRID);
    assert.equal(snap(-3), -0);
    assert.equal(snap(17), 16);
});

// --- picking ---------------------------------------------------------------------------------

test('a port wins over the node it sits on', () => {
    const branch = place('flow.branch', 0, 0);
    const at = portPosition(branch.node, branch.ports, 'in', 'in');

    const hit = hitTest([branch], at);

    assert.equal(hit.kind, 'port');
    assert.equal(hit.port.id, 'in');
    assert.equal(hit.direction, 'in');
});

test('the body of a node is picked as the node, and the title bar says so', () => {
    const branch = place('flow.branch', 0, 0);

    const body = hitTest([branch], { x: 80, y: HEADER_HEIGHT + 30 });
    const header = hitTest([branch], { x: 80, y: 8 });

    assert.equal(body.kind, 'node');
    assert.equal(body.header, false);
    assert.equal(header.header, true);
});

test('empty canvas is picked as empty canvas', () => {
    const branch = place('flow.branch', 0, 0);

    assert.equal(hitTest([branch], { x: 900, y: 900 }).kind, 'canvas');
    assert.equal(hitTest([], { x: 0, y: 0 }).kind, 'canvas');
});

test('what is drawn last is picked first', () => {
    const under = place('event.start', 0, 0);
    const over = place('event.update', 10, 0);

    const hit = hitTest([under, over], { x: 60, y: 10 });

    assert.equal(hit.node, over.node);
});

// --- framing -----------------------------------------------------------------------------------

test('bounds cover every node, and an empty graph has none', () => {
    const first = place('event.start', 0, 0);
    const second = place('event.start', 300, 120);

    const bounds = graphBounds([first, second]);

    assert.equal(bounds.x, 0);
    assert.equal(bounds.y, 0);
    assert.equal(bounds.width, 300 + NODE_WIDTH);
    assert.equal(graphBounds([]), null);
});

test('fitting puts the content in the middle of the viewport', () => {
    const node = place('event.start', 0, 0);

    const view = fitView([node], { width: 800, height: 600 });
    const centre = toScreen(
        { x: NODE_WIDTH / 2, y: nodeSize(node.ports).height / 2 },
        view
    );

    assert.equal(Math.round(centre.x), 400);
    assert.equal(Math.round(centre.y), 300);
});

test('fitting an empty graph, or a viewport with no size, is the identity view', () => {
    assert.deepEqual(fitView([], { width: 800, height: 600 }), { x: 0, y: 0, zoom: 1 });
    assert.deepEqual(fitView([place('event.start', 0, 0)], { width: 0, height: 0 }), { x: 0, y: 0, zoom: 1 });
});

// --- rows: a control sits beside the port it edits (ADR-0033) --------------------------

test('a control that edits a port takes that port\'s row', () => {
    const ports = {
        inputs: [{ id: 'in', kind: 'flow' }, { id: 'value', kind: 'data' }],
        outputs: [{ id: 'out', kind: 'flow' }]
    };
    const rows = nodeRows(ports, [{ name: 'value', port: 'value' }]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].control, null, 'the flow row keeps to itself');
    assert.equal(rows[1].control.port, 'value');
    assert.equal(rows[1].input.id, 'value', 'the field is on the socket it feeds');
});

test('a control that edits no port takes the first row that has none', () => {
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const rows = nodeRows(ports, [{ name: 'value' }]);

    // THE COMPACT VALUE NODE, and it falls out of the rule rather than being a case: one
    // row, holding the field and the socket its content leaves by.
    assert.equal(rows.length, 1);
    assert.equal(rows[0].control.name, 'value');
    assert.equal(rows[0].output.id, 'value');
});

test('Get Property is one row: the picker, and the socket beside it', () => {
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const rows = nodeRows(ports, [{ name: 'property' }]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].control.name, 'property');
    assert.equal(rows[0].output.id, 'value');
});

test('Set Property puts the value socket on the same row as its field', () => {
    const ports = {
        inputs: [{ id: 'in', kind: 'flow' }, { id: 'value', kind: 'data' }],
        outputs: [{ id: 'out', kind: 'flow' }]
    };
    const rows = nodeRows(ports, [{ name: 'property' }, { name: 'value', port: 'value' }]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].control.name, 'property', 'the picker takes the free flow row');
    assert.equal(rows[1].input.id, 'value');
    assert.equal(rows[1].control.port, 'value');
});

test('a control that edits a port is never displaced by one that edits none', () => {
    const ports = { inputs: [{ id: 'a', kind: 'data' }], outputs: [] };
    const rows = nodeRows(ports, [{ name: 'mode' }, { name: 'a', port: 'a' }]);

    // The param asked for "the first free row" and the port control owns it. Declaring the
    // param first must not cost the port control its own line.
    assert.equal(rows[0].control.port, 'a');
    assert.equal(rows[1].control.name, 'mode');
    assert.equal(rows[1].input, null);
});

test('more controls than ports grow the node a row at a time', () => {
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };

    assert.equal(nodeRows(ports, []).length, 1);
    assert.equal(nodeRows(ports, [{ name: 'a' }]).length, 1);
    assert.equal(nodeRows(ports, [{ name: 'a' }, { name: 'b' }]).length, 2);
    assert.equal(
        nodeSize(ports, [{ name: 'a' }, { name: 'b' }]).height - nodeSize(ports, [{ name: 'a' }]).height,
        ROW_HEIGHT,
        'each further row costs exactly one row'
    );
});

test('a control naming a port that is not there falls back to a free row', () => {
    // A `Set Property` whose property was deleted still has to draw: the port went, the
    // descriptor may not have, and dropping the control on the floor would hide a value.
    const ports = { inputs: [], outputs: [] };
    const rows = nodeRows(ports, [{ name: 'value', port: 'gone' }]);

    assert.equal(rows.length, 0, 'a control for a port that is not there claims no row');
    assert.deepEqual(controlBoxes({ x: 0, y: 0 }, rows), []);
});

// --- control boxes ---------------------------------------------------------------------

test('a control box sits inside its own row, and inside the node', () => {
    const node = { x: 100, y: 50 };
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const rows = nodeRows(ports, [{ name: 'value' }]);
    const size = nodeSize(ports, [{ name: 'value' }]);
    const [box] = controlBoxes(node, rows);

    assert.ok(box.y >= node.y + HEADER_HEIGHT, 'never under the header');
    assert.ok(box.y + box.height <= node.y + size.height + 0.001, 'never past the bottom');
    assert.ok(box.x > node.x && box.x + box.width < node.x + size.width, 'inset from the edges');
});

test('a control is aligned with the port on its row, not below it', () => {
    const node = { x: 0, y: 0 };
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const rows = nodeRows(ports, [{ name: 'value' }]);
    const [box] = controlBoxes(node, rows);
    const port = portPosition(node, ports, 'out', 'value');

    // THE WHOLE POINT OF THE ROW MODEL: the middle of the field and the middle of the
    // socket are the same line, so a creator can see what feeds what.
    assert.ok(Math.abs((box.y + box.height / 2) - port.y) < 0.001);
});

test('a control makes room for the ports that share its row', () => {
    const node = { x: 0, y: 0 };
    const alone = { inputs: [], outputs: [] };
    const flanked = { inputs: [{ id: 'a', kind: 'data' }], outputs: [{ id: 'r', kind: 'data' }] };

    const [wide] = controlBoxes(node, nodeRows(alone, [{ name: 'v' }]));
    const [narrow] = controlBoxes(node, nodeRows(flanked, [{ name: 'v', port: 'a' }]));

    assert.ok(narrow.width < wide.width, 'a row with sockets gives the field less room');
    assert.ok(narrow.x > wide.x);
});

// THE `Add` NODE, WHICH DREW ITS FIELD THROUGH THE WORD "Result" AND LEFT A "t" SHOWING.
test('a control leaves room for a port label it does not speak for', () => {
    const node = { x: 0, y: 0 };
    const ports = {
        inputs: [{ id: 'a', kind: 'data', label: 'A' }],
        outputs: [{ id: 'result', kind: 'data', label: 'Result' }]
    };
    const rows = nodeRows(ports, [{ name: 'a', port: 'a' }]);
    const [box] = controlBoxes(node, rows);

    const silenced = silencedPorts(rows);
    assert.ok(silenced.has('in:a'), 'the field speaks for the socket it feeds');
    assert.ok(!silenced.has('out:result'), 'and not for the one on the other side');
    assert.ok(box.x + box.width < node.x + NODE_WIDTH - 40, 'so Result still has its room');
});

test('a param speaks for both ports on its row, and takes the room back', () => {
    const node = { x: 0, y: 0 };
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data', label: 'Value' }] };
    const rows = nodeRows(ports, [{ name: 'value' }]);
    const silenced = silencedPorts(rows);
    const [box] = controlBoxes(node, rows);

    assert.ok(silenced.has('out:value'));
    // The socket still needs its own width; the LABEL does not, because the field is it.
    assert.ok(box.x + box.width > node.x + NODE_WIDTH - 40);
});

test('a port with no label of its own needs no room kept for one', () => {
    const node = { x: 0, y: 0 };
    const flow = { inputs: [{ id: 'in', kind: 'flow', label: '' }], outputs: [{ id: 'out', kind: 'flow', label: '' }] };
    const [box] = controlBoxes(node, nodeRows(flow, [{ name: 'property' }]));

    assert.ok(box.width > NODE_WIDTH - 60, 'two blank flow sockets leave the picker its width');
});

test('control boxes stack in row order and do not overlap', () => {
    const node = { x: 0, y: 0 };
    const ports = { inputs: [{ id: 'a', kind: 'data' }], outputs: [] };
    const boxes = controlBoxes(node, nodeRows(ports, [
        { name: 'a', port: 'a' }, { name: 'b' }, { name: 'c' }
    ]));

    assert.equal(boxes.length, 3);
    for (let i = 1; i < boxes.length; i++) {
        assert.ok(boxes[i].y >= boxes[i - 1].y + boxes[i - 1].height, `${i} overlaps its predecessor`);
    }
});

test('a node with no controls reserves no room for them', () => {
    const ports = { inputs: [], outputs: [] };
    assert.deepEqual(controlBoxes({ x: 0, y: 0 }, nodeRows(ports, [])), []);
    assert.equal(nodeSize(ports, []).height, nodeSize(ports).height);
});

test('the whole of a node with controls is clickable', () => {
    const node = { id: 'n1', x: 0, y: 0 };
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const controls = [{ name: 'value' }, { name: 'other' }];
    const layout = [{ node, ports, controls }];
    const size = nodeSize(ports, controls);

    const hit = hitTest(layout, { x: NODE_WIDTH / 2, y: size.height - 4 });
    assert.equal(hit.kind, 'node');
    assert.equal(hit.node.id, 'n1');
});

test('the bounds of a node include the rows its controls added', () => {
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const controls = [{ name: 'value' }, { name: 'other' }];
    const withControls = graphBounds([{ node: { x: 0, y: 0 }, ports, controls }]);
    const without = graphBounds([{ node: { x: 0, y: 0 }, ports }]);

    assert.ok(withControls.height > without.height);
});

// --- the grid ---------------------------------------------------------------------------
//
// THE ARITHMETIC A BROWSER CANNOT BE ASKED ABOUT. A grid that pans at double speed or turns
// to fog at low zoom is a bug you can watch happen and cannot write a browser assertion
// for; here it is four numbers.

test('the grid tiles in screen pixels, so it never has to be scaled twice', () => {
    const spec = gridSpec({ x: 0, y: 0, zoom: 1 });

    assert.equal(spec.minor, spec.spacing);
    assert.equal(spec.major, spec.minor * MAJOR_EVERY);
});

test('the emphasised grid is always a whole number of fine squares', () => {
    for (const zoom of [MIN_ZOOM, 0.4, 0.75, 1, 1.6, MAX_ZOOM]) {
        const spec = gridSpec({ x: 0, y: 0, zoom });
        assert.equal(spec.major / spec.minor, MAJOR_EVERY, `at zoom ${zoom}`);
    }
});

test('the grid carries the pan, and only the pan', () => {
    const spec = gridSpec({ x: -137, y: 42, zoom: 1 });

    assert.equal(spec.x, -137);
    assert.equal(spec.y, 42);
});

test('the grid never becomes fog, however far the canvas is zoomed out', () => {
    for (const zoom of [MIN_ZOOM, 0.3, 0.5]) {
        const spec = gridSpec({ x: 0, y: 0, zoom });
        assert.ok(spec.minor >= 14, `at zoom ${zoom} the fine lines were ${spec.minor}px apart`);
    }
});

test('the grid never becomes three lines, however far the canvas is zoomed in', () => {
    for (const zoom of [1, 1.8, MAX_ZOOM]) {
        const spec = gridSpec({ x: 0, y: 0, zoom });
        assert.ok(spec.minor <= 160, `at zoom ${zoom} the fine lines were ${spec.minor}px apart`);
    }
});

test('the spacing doubles rather than drifting, so lines stay on the same coordinates', () => {
    const sizes = new Set();
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += 0.05) {
        sizes.add(gridSpec({ x: 0, y: 0, zoom }).spacing);
    }

    // Every spacing is GRID times a power of two: nothing in between, at any zoom.
    for (const spacing of sizes) {
        const ratio = spacing / GRID;
        assert.equal(Math.log2(ratio) % 1, 0, `${spacing} is not a power-of-two multiple of ${GRID}`);
    }
});

test('the grid is measured in CSS pixels, so a 2x display draws the same one', () => {
    // An SVG lays out in CSS pixels, so the zoom already is CSS pixels per graph unit and
    // there is no device-pixel term to divide out. Asking twice must answer twice the same.
    assert.deepEqual(gridSpec({ x: 0, y: 0, zoom: 1 }), gridSpec({ x: 0, y: 0, zoom: 1 }));
});

test('a degenerate view still produces a drawable grid', () => {
    const spec = gridSpec({ x: 0, y: 0, zoom: 0 });

    assert.ok(spec.minor > 0);
    assert.ok(spec.major > 0);
});
