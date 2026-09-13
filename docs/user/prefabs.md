# Prefabs

A **prefab** is a saved model of an object and everything under it: its components, its
values, its children. You build one enemy the way you want it, save it as a prefab, and from
then on you can place a hundred of them — or spawn them while the game runs.

A prefab is a [resource](resources.md), like an image or a scene. It lives in the Project
panel, it has a name you can change, and it can sit in a folder.

## Making one

**Drag an object from the Hierarchy into the Project panel.**

That is the whole gesture. The label that follows your pointer says
*"Save … as a prefab"* before you let go.

There is deliberately no `+ ▸ Prefab` entry: a prefab with nothing in it would be a resource
that could never build anything, so a prefab is always made *from* an object that already
works.

## What a prefab keeps, and what it cannot

A prefab keeps the whole subtree — the root object, all its children, all their components and
all their values.

What it cannot keep is a reference that **points out of that subtree**. If your enemy's
`Follow` component pointed at the `Player` object in the scene, that reference has nowhere to
go in a prefab: the prefab does not know about your scene, and the same prefab may be
instantiated into a scene with no `Player` at all.

So those references are cleared, and **the editor tells you which ones before it makes the
prefab** — you are never surprised by a reference that quietly became empty.

The usual fix is to have the spawned object find what it needs at run time, with
**Find By Tag** or **Get Object**, rather than to bake a scene reference in.

## Placing one by hand

**Drag the prefab from the Project panel into the scene.** An instance appears where you
dropped it.

You can also drop it on the **Hierarchy**, in which case it lands at the origin and you move
it in the viewport.

Each instance is a real, independent object. Change one and the others do not follow — a
prefab is a *model you built from*, not a live link. Editing the prefab does not retroactively
change instances that already exist in a scene.

## Spawning one while the game runs

Use the **Spawn Prefab** node.

```
On Key (Space)  ──►  Spawn Prefab (Bullet)  ──►  Set Position
                            │ Spawned ───────────────┘
```

- Pick the prefab in the node's own field, **or** wire a **Resource** value in when the graph
  works out which prefab at run time.
- The node hands out the **spawned object**, so `Set Position`, `Set Property` and `Destroy`
  can all take it immediately.
- There is no X and Y on the node: `Set Position` already says "put this object here", and a
  built-in default would teleport every instance to the origin.

If the prefab is missing — an empty field, or a resource that was deleted — the flow carries
on and the spawned output reads as nothing. That is a state of the running game, not a crash;
**Is Valid** is the node that checks for it.

## Removing an instance

**Destroy** removes an object from the scene along with everything under it. Its default
target is **Self**, because "the enemy dies when it is hit" is the common case.

## A worked example: a bullet

1. Make an object called `Bullet`: a **Rectangle** (or a **Sprite**), a **Velocity**, a
   **Box Collider** with `solid` **off** so it only detects.
2. Give it a `.px` component that, on **On Start**, sets its Velocity; and on
   **On Collision**, destroys itself.
3. Drag `Bullet` from the Hierarchy into the Project panel. You now have a `Bullet` prefab.
4. Delete the `Bullet` object from the scene — you do not need it there.
5. On the player, add a `.px` with **On Key** ▸ **Spawn Prefab (Bullet)** ▸ **Set Position**,
   feeding the position from **Get Property** on **Self**.

## Next

- [Visual scripting](visual-scripting.md)
- [Node reference](node-reference.md#object) — Spawn, Spawn Prefab, Destroy, Is Valid
