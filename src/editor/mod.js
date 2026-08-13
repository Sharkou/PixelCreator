// Public entry point of the Editor.
//
// The Editor depends on the runtime and on the core; neither depends on it. That
// direction is checked by tools/layers/run.js, and it is what makes a published game
// loadable without an IDE — the coupling Legacy had, and still has, in
// `renderer.js -> editor/system/dnd.js`.
//
// Everything here needs a DOM. The core and the runtime do not, which is why they are
// the layers a server loads.

export { start, createEditorCamera } from './editor.js';
export { Selection } from './selection.js';
export { registerBuiltIns, BUILT_IN } from './registry.js';
export {
    OBJECT_KINDS,
    createObject,
    deleteObject,
    addComponent,
    removeComponent,
    availableComponents,
    uniqueName
} from './commands.js';
export { fillStarterScene } from './project/starter.js';

export { FieldKind, describeComponent, objectFields, formatValue, parseValue } from './inspector/schema.js';
export { HANDLE_SIZE, editorBounds, hitTest, pick, screenCorners } from './viewport/picking.js';
export { drawGrid, matrixScale, visibleWorldArea } from './viewport/grid.js';
export { outline } from './viewport/overlay.js';

export { PxElement, el, fill } from './ui/element.js';
export { PxPanel } from './ui/panel.js';
export { PxMenu, openMenu } from './ui/menu.js';
export { PxField } from './ui/field.js';
export { PxViewport } from './viewport/viewport.js';
export { PxHierarchy } from './windows/hierarchy.js';
export { PxInspector } from './windows/inspector.js';
