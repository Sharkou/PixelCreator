# Pixel Creator - AI Agent Guidelines

## Project Overview
Pixel Creator is a multiplayer collaborative pixel art editor and 2D game engine. It features a dual-architecture system:
- **Engine Core** (`src/`): Game engine with rendering, physics, input, networking, and graphics
- **Editor** (`editor/`): Web-based IDE for creating and manipulating 2D objects with drag-and-drop visual scripting

## Architecture Layers

### 1. Core Engine (`src/`)
The runtime engine provides the foundation for all game logic:
- **System**: Global event bus (`System.dispatchEvent()`, `System.addEventListener()`)
- **Scene**: Container for all game objects; manages object lifecycle and hierarchies
- **Object**: Base entity class with position, dimensions, components, and child objects
- **Renderer**: Canvas-based 2D rendering engine with camera support
- **Components**: Modular behavior system (Texture, CircleRenderer, RectangleRenderer, Collider, Controller, etc.)

### 2. Editor System (`editor/`)
The editor provides visual tools and workflows:
- **Windows**: UI panels (Hierarchy for object trees, Properties for editing, Project for resources, Toolbar for actions)
- **Handler**: Manages canvas interactions (drag, resize, camera pan, object selection)
- **Manager**: Component registry and UI component list
- **Graph**: Visual scripting interface with nodes and connectors
- **Miscellaneous**: Grid, ruler, stats, tabs, context menus, keyboard shortcuts, save/load

### 3. Integration Layer (`app.js`)
Entry point that initializes both engine and editor, coordinates network connection to server.

## Critical Data Flows

### Object-Component Pattern
Objects are containers; components provide behavior. Example:
```javascript
const obj = new Object('Player', 0, 0, 32, 32);
obj.addComponent(new Texture('player.png'));
obj.addComponent(new Controller()); // Input handling
scene.add(obj);
```
- Components must be imported from `/src/core/mod.js` barrel export
- Use `object.getComponent('ComponentName')` to retrieve components
- Properties sync via `System.dispatchEvent('setProperty', {object, component, prop, value})`

### Event System
All state changes flow through `System` event bus:
- `'add'`, `'remove'`, `'instantiate'`: Object lifecycle
- `'setProperty'`: Local property changes (triggers UI updates)
- `'syncProperty'`: Network synchronization to server
- `'addComponent'`, `'import'`: Component lifecycle
- `'setCurrentObject'`: Selection changes in editor

Editor windows subscribe to these events to stay synchronized.

### Editor-Engine Binding
- **Hierarchy**: Listens to `'add'`/`'remove'`/`'instantiate'` to update object tree
- **Properties**: Listens to `'setCurrentObject'` and `'setProperty'` to update property panels
- **Graph**: Visual node editor; compiles to executable code via `Graph.compile()`
- **Handler**: Intercepts canvas clicks/drags to select/manipulate objects, dispatches `'setProperty'` events

## Development Patterns & Conventions

### Property Synchronization
Two-layer property system in Object:
1. **Local edits**: `setProperty(prop, value)` → UI updates via `'setProperty'` event
2. **Server sync**: `syncProperty(prop, value)` → `'syncProperty'` event propagates to network

Both dispatch events that trigger cascade updates across editor windows.

### Component Rendering
Graphics components (Texture, CircleRenderer, etc.) define a `render(ctx, camera)` method:
```javascript
export class CircleRenderer extends Component {
    render(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}
```
Renderer loops through scene objects and calls each component's `render()` method.

### Module Structure
- **Barrel exports**: `/src/core/mod.js` re-exports all components for unified imports
- **System modules**: Static singletons (Renderer, Network, System, Time, Performance)
- **Editor-specific isolation**: Editor modules never directly modify engine objects; only dispatch System events

## Common Tasks

### Adding a New Component Type
1. Create component class in appropriate `src/` subdirectory (e.g., `src/graphics/newcomponent.js`)
2. Extend `Component` base class and implement `render(ctx, camera)` if visual
3. Add export to `/src/core/mod.js`
4. Register in `Manager.addComponent()` with icon and category for editor UI

### Modifying Object Properties
Always use `setProperty()` or `syncProperty()` rather than direct assignment to ensure UI/network updates:
```javascript
// Wrong: obj.x = 100;
// Right:
obj.setProperty('x', 100); // Local UI update
obj.syncProperty('x', 100); // Network sync
```

### Listening to Object Changes
```javascript
System.addEventListener('setProperty', data => {
    const {object, component, prop, value} = data;
    // React to changes across all objects
});
```

### Creating Editor UI Elements
Use `Hierarchy`, `Properties`, or `Project` window patterns:
- Query `System.addEventListener()` for state changes
- Build DOM elements via `document.createElement()`
- Store references in instance properties for cleanup

## Key Files for Reference
- **Object model**: [src/core/object.js](src/core/object.js#L186)
- **Event system**: [src/core/system.js](src/core/system.js#L145)
- **Scene management**: [src/core/scene.js](src/core/scene.js#L20)
- **Component registry**: [editor/system/manager.js](editor/system/manager.js#L14)
- **Editor bindings**: [editor/windows/properties.js](editor/windows/properties.js#L18)
- **Canvas interaction**: [editor/system/handler.js](editor/system/handler.js#L18)
- **Rendering pipeline**: [src/core/renderer.js](src/core/renderer.js#L1)

## Important Gotchas
- **Synchronization conflicts**: Only dispatch `'syncProperty'` when intentionally synchronizing to server; `setProperty` is for local editor-only updates
- **Component name collisions**: Component names must match export names in `/src/core/mod.js` exactly
- **Event propagation**: Listener order matters; events fire synchronously in registration order
- **DOM element IDs**: Must match object IDs for Hierarchy/Properties binding to work (`getElementById(obj.id)`)
