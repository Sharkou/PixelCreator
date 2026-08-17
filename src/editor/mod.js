// Public entry point of the Editor.
//
// The Editor depends on the runtime and on the core; neither depends on it. That
// direction is checked by tools/layers/run.js, and it is what makes a published game
// loadable without an IDE — the coupling Legacy had, and still has, in
// `renderer.js -> editor/system/dnd.js`.
//
// Everything here needs a DOM. The core and the runtime do not, which is why they are
// the layers a server loads.
//
// NAMING. Editor classes carry no prefix; the custom elements keep the mandatory `px-`
// one. Two of these names shadow globals — `Element`, `Window` — and one collides with a
// runtime export, `Viewport`. That is deliberate: they are the right names here, and the
// rule is the one `core/object.js` already lives by (CONVENTIONS.md) — a module that
// imports ours reaches for the global through `globalThis`, or aliases at the import.

export { start, createEditorCamera } from './editor.js';
export { Selection } from './selection.js';
export { Layout } from './layout.js';
export {
    BUILT_IN,
    CATEGORIES,
    registerBuiltIns,
    describeType,
    groupTypes
} from './registry.js';
export {
    OBJECT_KINDS,
    createObject,
    deleteObject,
    addComponent,
    removeComponent,
    moveComponent,
    reparentObject,
    availableComponents,
    descendants,
    uniqueName
} from './commands.js';
export { History, Histories } from './history.js';
export { Workspace } from './project/workspace.js';
export { fillStarterScene } from './project/starter.js';

export {
    FieldKind,
    fieldKindFor,
    describeComponent,
    objectFields,
    rows,
    formatValue,
    parseValue,
    toDisplay,
    isNumeric
} from './inspector/schema.js';

export { HANDLE_SIZE, editorBounds, hitTest, pick, screenCorners } from './viewport/picking.js';
export { HANDLES, MIN_SIZE, beginResize, isResizable, resizeTo, sizingComponent } from './viewport/resize.js';
export { drawGrid, matrixScale, visibleWorldArea } from './viewport/grid.js';
export { outline, handles, handleAt, handleCursor, handlePoints } from './viewport/overlay.js';
export { Guides } from './viewport/guides.js';
export { SelectTool } from './viewport/tools/select-tool.js';
export { PanTool } from './viewport/tools/pan-tool.js';

export { matches, visibleObjects } from './windows/search.js';
export { DropPosition, EDGE, canDrop, dropPositionAt, dropTarget, insertionIndex } from './windows/drop.js';

export { Element, el, fill } from './ui/element.js';
export { Window } from './ui/window.js';
export { Tabs } from './ui/tabs.js';
export { Splitter } from './ui/splitter.js';
export { Menu, openMenu } from './ui/menu.js';
export { Field } from './ui/field.js';
export { NumberInput } from './ui/number-input.js';
export { Viewport } from './viewport/viewport.js';
export { Hierarchy } from './windows/hierarchy.js';
export { Inspector } from './windows/inspector.js';
export { Toolbar } from './windows/toolbar.js';
// `px-dock` was split into these two windows; the class name that says "project" is
// taken by the project layer's own, so the window is exported under the name the tag
// carries (CONVENTIONS.md — a module that imports ours aliases at the import).
export { Project as ProjectWindow } from './windows/project.js';
export { Timeline } from './windows/timeline.js';
