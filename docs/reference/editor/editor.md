Static class for Monaco code editor management

```js
import { Editor } from '/editor/scripting/editor.js';
```

---

## Static Properties

### [`el`](###el)

The editor DOM container element

**Type**

| Name | Type |
|------|------|
| el | `HTMLElement` |

**Default:** `document.getElementById('editor')`

### [`launched`](###launched)

Indicates if Monaco editor has been initialized

**Type**

| Name | Type |
|------|------|
| launched | `boolean` |

**Default:** `false`

### [`current`](###current)

Currently open file in the editor

**Type**

| Name | Type |
|------|------|
| current | `File|null` |

### [`value`](###value)

Current editor content

**Type**

| Name | Type |
|------|------|
| value | `string` |

### [`editor`](###editor)

Monaco editor instance

**Type**

| Name | Type |
|------|------|
| editor | `monaco.editor.IStandaloneCodeEditor` |

---

## Static Methods

### [`init()`](###init())

Initialize the Monaco editor instance

**Example**

```js
Editor.init();
```

**Notes:**
- Loads Monaco editor from CDN
- Sets up custom dark theme
- Configures word wrap and automatic layout
- Sets up content change listeners
- Automatically detects and updates class names

### [`resize()`](###resize())

Resize the editor layout

**Example**

```js
Editor.resize();
```

### [`getValue()`](###getValue())

Get current editor content

**Returns:** `string` - The editor content

**Example**

```js
const code = Editor.getValue();
```

### [`setValue(text)`](###setValue())

Set editor content

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| text | `string` | The text to set |

**Example**

```js
Editor.setValue('class MyComponent {}');
```

### [`color(text, _class)`](###color())

Wrap text in a colored span

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| text | `string` | The text to color |
| _class | `string` | CSS class name |

**Returns:** `string` - HTML string

### [`tabulation(e)`](###tabulation())

Handle tab key press (inserts 4 spaces)

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `KeyboardEvent` | The keyboard event |

### [`getCaretPosition(element)`](###getCaretPosition())

Get caret position in an element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| element | `Element` | The element |

**Returns:** `number` - Caret offset

### [`setCaretPosition(element, offset)`](###setCaretPosition())

Set caret position in an element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| element | `Element` | The element |
| offset | `number` | Caret offset |

### [`countLines(code)`](###countLines())

Count and label lines in code element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| code | `Element` | The code element |

### [`getSelectedNode()`](###getSelectedNode())

Get currently selected DOM node

**Returns:** `Node` - The selected node

### [`getCurrentLine(node)`](###getCurrentLine())

Get current line element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| node | `Node` | The node to start from |

**Returns:** `Element` - The line element

### [`highlight(code)`](###highlight())

Highlight current line in code editor

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| code | `Element` | The code element |

### [`syntaxHighlights(code)`](###syntaxHighlights())

Apply syntax highlighting to code

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| code | `Element` | The code element |

---

## System Events

The `Editor` listens to:

### `setProperty`

Updates editor content when the current file's properties change

---

## Monaco Editor Theme

The editor uses a custom dark theme:

```js
{
  base: 'vs-dark',
  inherit: true,
  rules: [{ background: '#232323' }],
  colors: {
    'editor.background': '#272727',
    'minimap.background': '#272727'
  }
}
```

---

## Auto-detection

The editor automatically:
- Detects class name changes and updates the file name
- Synchronizes content with `project.current`
- Prevents updates during user input to avoid cursor jumps

---

## Notes

- Uses Monaco Editor (same as VS Code)
- Loaded from CDN: `https://unpkg.com/monaco-editor@latest/min/vs`
- Language is set to JavaScript
- Word wrap is enabled by default
- Automatic layout ensures proper sizing
- Tab key inserts 4 non-breaking spaces
