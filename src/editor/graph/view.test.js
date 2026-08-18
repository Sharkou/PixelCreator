// Where things are on the graph canvas (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeRegistry, PortKind, registerStandardNodes, portsOf } from '../../core/mod.js';
import {
    GRID,
    HEADER_HEIGHT,
    MAX_ZOOM,
    MIN_ZOOM,
    NODE_WIDTH,
    clampZoom,
    connectionPath,
    fitView,
    graphBounds,
    hitTest,
    nodeSize,
    paramBoxes,
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
    assert.equal(nodeSize({ inputs: [], outputs: [] }).height, HEADER_HEIGHT + 20);
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

    assert.equal(second.y - first.y, 20);
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

// --- params drawn inside the node (ADR-0031) -------------------------------------------

test('a node with params is taller, by one row each', () => {
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const bare = nodeSize(ports).height;

    assert.ok(nodeSize(ports, 1).height > bare, 'one param makes room for itself');
    assert.equal(
        nodeSize(ports, 2).height - nodeSize(ports, 1).height,
        nodeSize(ports, 3).height - nodeSize(ports, 2).height,
        'each further param costs the same'
    );
});

test('a param box sits under the last port, inside the node', () => {
    const node = { x: 100, y: 50 };
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const size = nodeSize(ports, 1);
    const [box] = paramBoxes(node, ports, 1);

    assert.ok(box.y >= node.y + HEADER_HEIGHT, 'never under the header');
    assert.ok(box.y + box.height <= node.y + size.height + 0.001, 'never past the bottom');
    assert.ok(box.x > node.x && box.x + box.width < node.x + size.width, 'inset from the edges');
});

test('param boxes stack in order and do not overlap', () => {
    const node = { x: 0, y: 0 };
    const ports = { inputs: [{ id: 'a', kind: 'data' }], outputs: [] };
    const boxes = paramBoxes(node, ports, 3);

    assert.equal(boxes.length, 3);
    for (let i = 1; i < boxes.length; i++) {
        assert.ok(boxes[i].y >= boxes[i - 1].y + boxes[i - 1].height, `${i} overlaps its predecessor`);
    }
});

test('a node with no params reserves no room for them', () => {
    const ports = { inputs: [], outputs: [] };
    assert.deepEqual(paramBoxes({ x: 0, y: 0 }, ports, 0), []);
    assert.equal(nodeSize(ports, 0).height, nodeSize(ports).height);
});

test('the whole of a node with params is clickable', () => {
    const node = { id: 'n1', x: 0, y: 0 };
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const layout = [{ node, ports, params: [{ name: 'value' }] }];
    const size = nodeSize(ports, 1);

    // A point in the param strip is inside the node, and used to fall through to canvas.
    const hit = hitTest(layout, { x: NODE_WIDTH / 2, y: size.height - 4 });
    assert.equal(hit.kind, 'node');
    assert.equal(hit.node.id, 'n1');
});

test('the bounds of a node with params include them', () => {
    const ports = { inputs: [], outputs: [{ id: 'value', kind: 'data' }] };
    const withParams = graphBounds([{ node: { x: 0, y: 0 }, ports, params: [{ name: 'value' }] }]);
    const without = graphBounds([{ node: { x: 0, y: 0 }, ports }]);

    assert.ok(withParams.height > without.height);
});
