Tab navigation system

```js
import openTab from '/editor/misc/tabs.js';
```

---

## Functions

### [`openTab(e, id, parentID)`](###openTab())

Open a tab and hide others

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `Event` | The click event |
| id | `string` | The tab content ID |
| parentID | `string` | The parent container ID |

**Example**

```js
button.addEventListener('click', (e) => {
  openTab(e, 'scene-tab', 'scene-container');
});
```

**Behavior:**
1. Hides all `.tab-content` elements in parent
2. Removes `.active` class from all `.tab-link` elements
3. Shows the target tab content
4. Adds `.active` class to clicked button

---

## Default Tab Listeners

The module sets up these tab buttons:

### Scene Tab

```js
document.getElementById('scene-btn')
```

Shows: `wrapper` (main scene view)

### Graph Tab

```js
document.getElementById('graph-btn')
```

Shows: `overlay` (visual scripting graph)

### Project Tab

```js
document.getElementById('project-btn')
```

Shows: `resources-container` (project files)

### Timeline Tab

```js
document.getElementById('timeline-btn')
```

Shows: `timeline` (animation timeline)

---

## CSS Classes

### `.tab-content`

Applied to tab content containers
- Hidden by default
- Shown when tab is active

### `.tab-link`

Applied to tab buttons
- Gets `.active` class when selected
- Removed from all other tabs

---

## Notes

- Default export function
- Automatically hides inactive tabs
- Only one tab visible at a time per parent container
- Works with any parent container and tab structure
- Manages active state for styling
