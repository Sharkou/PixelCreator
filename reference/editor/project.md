Initialize a new `Project`

```js
import { Project } from '/editor/windows/project.js';

const project = new Project('resources-list', scene);
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| node | `HTMLElement` | The HTML element ID |
| scene | `Scene` | The current scene |

---

## Static Properties

### [`main`](###main)

Get/set current project

**Type**

| Name | Type |
|------|------|
| main | `Project` |

**Example**

```js
const currentProject = Project.main;
```

---

## Properties

### [`node`](###node)

The project resources DOM container element

**Type**

| Name | Type |
|------|------|
| node | `HTMLElement` |

### [`scene`](###scene)

Reference to the current scene

**Type**

| Name | Type |
|------|------|
| scene | `Scene` |

### [`files`](###files)

Dictionary of all project files

**Type**

| Name | Type |
|------|------|
| files | `Object` |

**Example**

```js
const file = project.files['file-id-123'];
```

### [`input`](###input)

File upload input element

**Type**

| Name | Type |
|------|------|
| input | `HTMLInputElement` |

### [`current`](###current)

Currently opened file

**Type**

| Name | Type |
|------|------|
| current | `File` |

**Example**

```js
project.current = myScriptFile;
```

---

## Methods

### [`init(files)`](###init())

Initialize the project with files

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| files | `Array` | The project files |

**Example**

```js
project.init(loadedFiles);
```

### [`add(file, dispatch)`](###add())

Add file to files list

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| file | `File` | The file |
| dispatch | `boolean` | Whether to dispatch event (default: true) |

**Example**

```js
project.add(newFile);
```

### [`remove(file, dispatch)`](###remove())

Remove file from files list

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| file | `File` | The file |
| dispatch | `boolean` | Whether to dispatch event (default: true) |

**Example**

```js
project.remove(oldFile);
```

### [`updateName(e)`](###updateName())

Update file name from HTML element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `HTMLElement` | The HTML element |

### [`createThumbnail(file, callback)`](###createThumbnail())

Create thumbnail from file

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| file | `File` | The file/blob |
| callback | `Function` | The callback function |

**Returns:** `Promise<Image>` - Promise resolving to the image

**Example**

```js
const thumbnail = await project.createThumbnail(imageFile);
```

### [`createView(file)`](###createView())

Create resource view for a file

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| file | `File` | The file to display |

**Returns:** `HTMLElement` - The list item element

---

## System Events

The `Project` listens to:

### `load_file`

Triggered when a file is loaded - adds it to the project

### `upload_file`

Triggered when a file is uploaded - adds it to the project

### `remove_file`

Triggered when a file is removed - removes it from the project

---

## Drag and Drop

The project panel supports:

- **File upload**: Drop files to upload them to the project
- **Prefab creation**: Drop an object from the hierarchy to create a prefab

---

## File Types

Supported file types with icons:

| Type | Icon | Draggable |
|------|------|-----------|
| Image | Thumbnail | Yes |
| Script (.js) | `description` | Yes |
| PixelScript (.px) | `settings_input_component` | Yes |
| Prefab | Prefab thumbnail | Yes |

---

## Interaction

### Mouse Events

- **Click**: Selects the file
- **Double-click**:
  - Scripts: Opens in script editor
  - PixelScript: Opens in graph editor
  - Other files: Selects the file
- **Drag**: Allows dragging to scene or properties

---

## Notes

- Automatically sets `Project.main` on instantiation
- When a script is set as `current`, it loads into the `Editor`
- Images display their natural thumbnail
- Scripts can be edited by double-clicking
- Prefabs store component data and can be instantiated in the scene
- Files are stored in `files` dictionary with ID as key
