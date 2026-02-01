Initialize a new `Graph`

```js
import { Graph } from '/editor/graph/graph.js';

const graph = new Graph();
```

---

## Properties

### [`nodes`](###nodes)

Dictionary of all nodes in the graph

**Type**

| Name | Type |
|------|------|
| nodes | `Object` |

**Example**

```js
const node = graph.nodes['node-id-123'];
```

### [`boxes`](###boxes)

Node type palette elements

**Type**

| Name | Type |
|------|------|
| boxes | `HTMLCollection` |

### [`graph`](###graph)

Graph container DOM element

**Type**

| Name | Type |
|------|------|
| graph | `HTMLElement` |

### [`svg`](###svg)

SVG element for connection paths

**Type**

| Name | Type |
|------|------|
| svg | `SVGElement` |

### [`currentConnector`](###currentConnector)

Currently dragging connector

**Type**

| Name | Type |
|------|------|
| currentConnector | `Element|null` |

### [`currentNode`](###currentNode)

Currently dragging node

**Type**

| Name | Type |
|------|------|
| currentNode | `Node|null` |

### [`code`](###code)

Generated PixelScript code

**Type**

| Name | Type |
|------|------|
| code | `string` |

---

## Methods

### [`createNode(type, e)`](###createNode())

Create a new node in the graph

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| type | `string` | The node type |
| e | `Object` | Mouse position `{x, y}` |

**Example**

```js
graph.createNode('print', { x: 100, y: 100 });
```

### [`deleteNode(id)`](###deleteNode())

Delete a node from the graph

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| id | `string` | The node ID |

### [`createPath(a, b)`](###createPath())

Create SVG path between two points

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| a | `Object` | Start point `{x, y}` |
| b | `Object` | End point `{x, y}` |

**Returns:** `string` - SVG path string

**Example**

```js
const path = graph.createPath({ x: 0, y: 0 }, { x: 100, y: 100 });
```

### [`deletePath(connector)`](###deletePath())

Delete a connection path

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| connector | `Element` | The connector element |

### [`addConnectorPath(path)`](###addConnectorPath())

Add SVG path to the graph

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| path | `SVGPathElement` | The path element |

### [`connect(input, output)`](###connect())

Connect two connectors

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| input | `Element` | Input connector |
| output | `Element` | Output connector |

### [`getConnectorPos(connector)`](###getConnectorPos())

Get connector position in graph coordinates

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| connector | `Element` | The connector element |

**Returns:** `Object` - Position `{x, y}`

### [`getOffset(el)`](###getOffset())

Get element offset relative to graph

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `Element` | The element |

**Returns:** `Object` - Offset `{left, top}`

### [`getMousePos(e)`](###getMousePos())

Get mouse position in graph coordinates

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `MouseEvent` | The mouse event |

**Returns:** `Object` - Position `{x, y}`

### [`updateScript(id, code)`](###updateScript())

Update PixelScript content

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| id | `string` | Script ID |
| code | `string` | Script code |

---

## Events

The graph handles the following mouse events:

### `dragover`

Allows dropping node types onto the graph

### `drop`

Creates a new node at the drop position

### `mousedown`

Starts dragging a connector or node

### `mouseup`

Completes connection or stops dragging

### `mousemove`

Updates connection path or moves node

---

## Connection Rules

- Input connectors can only connect to output connectors
- Output connectors can only connect to input connectors
- Connectors from the same node cannot connect to each other
- Only one connection per connector

---

## Visual Feedback

Connectors have three states (CSS classes):
- `.empty`: No connection
- `.filled`: Dragging or connected
- `.connected`: Active connection

---

## Notes

- Visual scripting system for creating logic without code
- Nodes can be dragged to reposition
- Connections are drawn as bezier curves
- The graph auto-scrolls with content
- Each node maintains references to its attached paths
- Connection paths update when nodes move
