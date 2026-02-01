Initialize a new `Node`

```js
import { Node } from '/editor/graph/node.js';

const node = new Node('print');
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| type | `string` | The node type/command |

---

## Properties

### [`id`](###id)

Unique node identifier

**Type**

| Name | Type |
|------|------|
| id | `string` |

### [`type`](###type)

Node type/command

**Type**

| Name | Type |
|------|------|
| type | `string` |

**Example**

```js
node.type // 'print'
```

### [`value`](###value)

Current node value/content

**Type**

| Name | Type |
|------|------|
| value | `string` |

### [`inputs`](###inputs)

Array of input connectors

**Type**

| Name | Type |
|------|------|
| inputs | `Array<Element>` |

### [`outputs`](###outputs)

Array of output connectors

**Type**

| Name | Type |
|------|------|
| outputs | `Array<Element>` |

### [`connected`](###connected)

Indicates if node has any connections

**Type**

| Name | Type |
|------|------|
| connected | `boolean` |

### [`attachedPaths`](###attachedPaths)

Array of SVG connection paths

**Type**

| Name | Type |
|------|------|
| attachedPaths | `Array<Object>` |

**Object structure:**

```js
{
  input: Element,    // Input connector
  output: Element,   // Output connector
  path: SVGPathElement  // SVG path
}
```

### [`el`](###el)

Node DOM element

**Type**

| Name | Type |
|------|------|
| el | `HTMLElement` |

---

## Methods

### [`createView()`](###createView())

Create the DOM element for the node

**Returns:** `HTMLElement` - The node element

### [`getCaret()`](###getCaret())

Get current caret position

**Returns:** `Object` - `{container, range}`

### [`setCaret(index, x)`](###setCaret())

Set caret position

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| index | `number` | Child node index |
| x | `number` | Offset within node |

### [`createConnector(type, name)`](###createConnector())

Create a connector element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| type | `string` | Connector type: `'input'`, `'output'`, or `'error'` |
| name | `string` | Connector name/title |

**Returns:** `Element` - The connector element

**Example**

```js
const input = node.createConnector('input', 'value');
```

### [`deleteConnector(connector)`](###deleteConnector())

Delete a connector

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| connector | `Element` | The connector to delete |

### [`setConnectorPos(connector, x)`](###setConnectorPos())

Set connector horizontal position

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| connector | `Element` | The connector element |
| x | `number` | X coordinate |

### [`detachConnector(connector)`](###detachConnector())

Detach a connector (remove its connection)

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| connector | `Element` | The connector element |

### [`updateConnectorsPos()`](###updateConnectorsPos())

Update all connector path positions

### [`moveTo(pos)`](###moveTo())

Move node to position

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| pos | `Object` | Position `{x, y}` |

**Example**

```js
node.moveTo({ x: 100, y: 200 });
```

### [`ownsInput(connector)`](###ownsInput())

Check if connector is an input of this node

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| connector | `Element` | The connector element |

**Returns:** `boolean`

### [`ownsOutput(connector)`](###ownsOutput())

Check if connector is an output of this node

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| connector | `Element` | The connector element |

**Returns:** `boolean`

---

## Content Editing

The node content is editable:

1. Click the node text to edit
2. Type command and parameters
3. Parameters are auto-detected and create connectors

### Syntax

```
command param1 param2 param3
```

- First word is the command (displayed differently)
- Following words are parameters
- Each parameter gets an input and output connector
- Variables start with `$` (e.g., `$player`)

### Example

```
print "Hello" $name
```

Creates:
- Command: `print`
- Input connectors for: `"Hello"`, `$name`
- Output connectors for: `"Hello"`, `$name`

---

## Connector Types

### Standard Connectors

- **Input**: Top connector, receives data flow
- **Output**: Bottom connector, sends data flow
- **Error**: Error output (not currently used)

### Dynamic Connectors

Created based on parameters:
- One input connector per parameter
- One output connector per parameter
- Positioned relative to parameter text location

---

## Notes

- Node content is contenteditable
- Parameter detection uses regex to identify valid identifiers
- Forbidden characters: `+ - * / > >= < <= != = | & ; { } ( ) [ ] ? , . : ! ^ space`
- Authorized characters: `a-z A-Z _ $ 0-9`
- Variables (starting with `$`) are styled differently
- Connectors are positioned dynamically as you type
- Each connector has an associated SVG path for connections
