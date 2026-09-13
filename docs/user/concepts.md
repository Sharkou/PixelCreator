# Concepts and glossary

The vocabulary Pixel Creator uses, defined once. These words mean the same thing in the
editor, in the documentation and in the code — there is no second set of names for
programmers.

## The shape of a project

```
Project
└── Scene
    └── Object
        ├── Object          (a child — moves with its parent)
        ├── Object
        └── Component…      (what makes the object do something)
```

Everything else in the Project panel — images, sounds, graphs, prefabs, animations, tilesets,
folders — is a **resource**.

---

## A–Z

**Active** — One switch per object. An object that is off does not draw *and* does not run.
The Hierarchy's eye and the Inspector's checkbox are the same value.

**Animation** — A resource: a strip of a picture, and how fast to walk it. Played by the
**Sprite Animator** component. Ten enemies playing one clip all name one resource.

**Asset** — A file you imported: an image, a sound. Its bytes are copied into your project, so
moving the original afterwards changes nothing.

**Bundle** — The whole project as one JSON payload. What **Preview** plays and what **Export**
writes to a file.

**Camera** — An ordinary object with a **Camera** component. It decides what is on screen. You
move it, parent it and animate it like anything else.

**Collider** — A rectangle used for collision. **Solid** colliders block things that have a
**Body**; non-solid ones only *detect*, which is how you build a trigger.

**Component** — A piece of behaviour or data attached to an object. A component is plain data:
numbers, text, colours, and references to resources or other objects. An object may carry
several of the same kind, and their order is real and saved.

**Component type** — What kind of component something is. `Sprite` is a type the engine ships;
a `.px` file you drew is a type too.

**Delta Time** — How long one simulation step lasts, in seconds. Multiply a speed by it to
turn "per step" into "per second".

**Document** — Something open in a tab above the viewport: the scene, or a `.px` graph. Each
document has its own undo stack.

**Drag and drop** — A first-class way to work here, not a shortcut. The editor tells you in
words what a drop will do before you let go, and refuses out loud when it cannot.

**Flow** (port) — A wire that carries *when*: the order in which acts happen. One flow output
reaches at most one flow input.

**Data** (port) — A wire that carries a value. One data input is fed by at most one output; an
output may feed many inputs.

**Folder** — A resource like any other, with a name and a place. Deleting one deletes its
contents, as a single undo entry.

**Handle** — (1) One of the eight squares around a selected object, for resizing. (2) How an
object travels along a data wire in a graph — a reference that can be checked with **Is
Valid**, never a position in a scene.

**Hierarchy** — The panel listing the objects in the open scene, as a tree. Also the tree
itself: parents and children.

**Id** — The real identity of an object, a resource or a component. Opaque, minted once, never
changes, and never shown as a name. Everything points at ids, which is why renaming is always
safe.

**Inspector** — The right-hand panel: everything about whatever is selected.

**Layer** — Draw order. Higher draws in front.

**Node** — A box in a `.px` graph. One node, one intention.

**Object** — A thing in the scene. It has a name, a tag, a layer and an *active* flag — and
nothing else of its own. Where it is, what it looks like and what it does all come from
components. (Never called an "entity".)

**Operation** — The internal form of an intentional change: "set this property", "add this
object", "move this resource". Every edit you make becomes one, which is what makes undo,
history and (eventually) replication possible from one mechanism.

**`.px`** — A graph file. It is simultaneously a **resource** in your project and a
**component type** you can put on objects.

**Parent / child** — Any object can be a child of another. A child's Transform is relative to
its parent's: move the parent and the child comes with it. Reparenting in the editor keeps the
child visually where it is.

**Play mode** — Running the simulation inside the editor, on the live scene. **Stop** restores
the scene exactly as Play found it.

**Prefab** — A saved model of an object and everything under it, as a resource. Placed by
dragging, or spawned by a graph. An instance is independent — a prefab is a model you built
from, not a live link.

**Preview** — The game in its own window, with no editor around it. What a player gets.

**Project** — One game: its scenes, its resources, and the identity that ties them together.
Kept in this browser.

**Property** — A named value on an object or a component. Properties are what the Inspector
edits and what a graph's **Get Property** / **Set Property** reach.

**Resource** — Anything in the Project panel: a scene, an image, a sound, a `.px`, a prefab, an
animation, a tileset, a folder.

**Scene** — A place the game happens in: a set of objects, arranged. A project may hold many;
one is open at a time.

**Screen space** — An object marked with the **Screen Space** component belongs to the
interface, not the world: the camera never moves it. That is what a HUD is.

**Session value** — Something a graph wrote with **Set Session Value**. It survives a change of
scene, when nothing else does — a score, a life count.

**Step** — One tick of the simulation, at a fixed rate. **On Update** fires once per step.

**Tag** — A free-form label on an object, so a graph can find it with **Find By Tag**.

**Tilemap** — A component: a grid of painted cells on an object.

**Tileset** — A resource: the *cutting* of a picture into tiles. Several maps may share one.

**Transform** — The component that says where an object is: position, rotation and scale. A
child's is relative to its parent's.

**Undo entry** — One thing you did, however many values it changed. A drag, a stroke of fifty
tiles, a whole typed name, a deleted folder — each is one **Ctrl Z**.

**Viewport** — The middle of the window: the scene, drawn by the real engine.

**World units** — The coordinates a scene is measured in. The editor rounds placements to
whole units — a sprite at x = 137.4183 is not precision, it is noise.

---

## Two ideas worth keeping

**Writing a property is how everything finds out.** When a value changes, every view that
shows it updates, and the change becomes an *operation* that can be validated, undone, and one
day replicated. You never call a "sync" function, and there is no second path for
"networked" values.

**The editor and the engine share one model.** The editor is not an external tool driving the
engine through a wall; it is an administrator's view of a living runtime. That is why you can
edit a scene while it is playing, and why the viewport is drawn by the same renderer a player's
browser uses.

## Next

- [Getting started](getting-started.md)
- [Objects and components](objects-and-components.md)
- Curious about how it is built? [Developer documentation](../developer/README.md)
