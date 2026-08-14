Static class for script compilation and execution

```js
import { Interpreter } from '/editor/scripting/interpreter.js';
```

---

## Static Properties

### [`window`](###window)

Popup window for script editing

**Type**

| Name | Type |
|------|------|
| window | `Window|null` |

---

## Static Methods

### [`open(id, name, data)`](###open())

Open a script in a new popup window

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| id | `string` | The script resource ID |
| name | `string` | The script name |
| data | `Object` | The script data |

**Example**

```js
Interpreter.open('script-123', 'MyScript', scriptData);
```

**Notes:**
- Opens script editor in a new window
- Window dimensions: 800x500
- Passes data to the new window via `window.data`

### [`run(source)`](###run())

Compile and run a script source

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| source | `string` | The JavaScript source code |

**Returns:** `Function|null` - The compiled class/function or null on error

**Example**

```js
const Component = Interpreter.run('class MyComponent { update() {} }');
```

**Behavior:**
1. Evaluates the source code as a class
2. Tests the class by instantiating it
3. Validates `update()` and `draw()` methods if present
4. Registers the class on the global `window` object
5. Returns the compiled class

**Error Handling:**
- `TypeError`: Compiles anyway (may occur when using other component properties)
- `SyntaxError`: Logs error message
- Other errors: Returns `null` and stops compilation

### [`update(script)`](###update())

Update all instances of a script in the scene

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| script | `Object` | The script resource with compiled data |

**Example**

```js
Interpreter.update(scriptResource);
```

**Behavior:**
1. Updates the resource name to match the class name
2. Refreshes the scene editor UI
3. Finds all objects with this component
4. Re-instantiates the component on each object
5. Updates properties panel if the object is selected

---

## Compilation Process

### Script Format

Scripts should export a class:

```js
class MyComponent {
  constructor() {
    // Initialization
  }

  update() {
    // Called every frame
  }

  draw() {
    // Called for rendering
  }
}
```

### Registration

Compiled classes are registered globally:

```js
window[ClassName] = CompiledClass;
```

This allows dynamic instantiation:

```js
const instance = new window['MyComponent']();
```

---

## Live Updates

When a script is updated:
- All scene objects using that component are refreshed
- The component is re-instantiated with the new code
- Properties panel updates if the object is currently selected

---

## Notes

- Uses `eval()` for dynamic code execution
- Scripts are compiled as classes
- Component names are case-insensitive (converted to lowercase for lookup)
- Updates happen in real-time across all instances
- Errors are logged to console but don't crash the editor
