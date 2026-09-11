// Which space an Object is drawn in — the world the camera looks at, or the screen itself.
//
// THE PROBLEM IT SOLVES IS A SCORE THAT WALKS OFF THE SCREEN. A HUD label is an ordinary
// Object with an ordinary Transform, so the view matrix moves it with everything else: put
// it at (20, 20) and it sits twenty units from the world origin, not twenty pixels from the
// corner. Every 2D engine answers this somehow; what differs is what the answer costs.
//
// IT IS A COMPONENT, NOT A FLAG ON EACH RENDERER (ADR-0060 §3). A `space` property on
// `TextRenderer`, on `Sprite` and on `RectangleRenderer` would be the same decision written
// three times, and an Object carrying two of them could disagree with itself about where it
// is. "Where is this Object drawn" is a question about the OBJECT, so it is answered once,
// by a Component the Object either carries or does not.
//
// AND IT IS INHERITED, BECAUSE A TRANSFORM IS. A HUD is a root with labels parented under
// it; `worldMatrix()` already composes a child through its parent, so a child that did not
// inherit the space would be positioned in screen units and then drawn through the view —
// the one combination that is never what anybody meant. The walk is up the parent chain,
// which is the same chain the matrix itself is composed along.
//
// NOTHING HERE KNOWS A COMPONENT BY NAME. A component type declares `static space`, and
// this reads it — the same duck typing `draw()` and `bounds()` already use (ADR-0004), so
// the scene renderer keeps having no per-type branch in it.

/** The two spaces an Object can be drawn in. */
export const DrawSpace = {
    /** Placed in the world, seen through the camera. The default for everything. */
    WORLD: 'world',
    /** Placed on the surface: (0, 0) is the top-left corner, one unit is one pixel. */
    SCREEN: 'screen'
};

/**
 * The space an Object is drawn in.
 *
 * A component that is switched off declares nothing, like a component that is switched off
 * draws nothing: `active` is the one state of life (ADR-0026 §2), so unchecking `Screen
 * Space` puts the label back in the world rather than leaving it half-way.
 *
 * @param {object} object - The Object
 * @returns {string} One of DrawSpace
 */
export function drawSpaceOf(object) {
    // Bounded by the chain, and a scene cannot hold a cycle of parents — `Object.addChild()`
    // refuses one — so this terminates on the root.
    for (let node = object; node; node = node.parent ?? null) {
        const components = node.components;
        if (!components) continue;

        for (const type of globalThis.Object.keys(components)) {
            const component = components[type];
            if (component?.active === false) continue;

            const declared = component?.constructor?.space ?? null;
            if (declared === DrawSpace.SCREEN) return DrawSpace.SCREEN;
        }
    }

    return DrawSpace.WORLD;
}

export class ScreenSpace {

    static type = 'ScreenSpace';

    /**
     * What this Component is FOR, read by `drawSpaceOf()` and by nothing else.
     *
     * A static rather than a property, because it is a fact about the TYPE: an instance that
     * could answer `world` would be a `ScreenSpace` that is not one, and the control for
     * that already exists — it is `active`.
     */
    static space = DrawSpace.SCREEN;

    /**
     * No schema, and no fields.
     *
     * WHAT WOULD GO IN ONE IS ALREADY SOMEWHERE. An anchor (`top-left`, `centre`) is the
     * first thing anybody asks for, and it is deliberately absent: the surface's origin IS
     * the top-left corner (runtime/rendering/viewport.js), so `x = 20, y = 20` is already
     * twenty pixels from it, and an anchor would be a second coordinate system laid over the
     * one a creator has just learned. It comes back the day a layout exists to attach it to.
     */
    static schema = {};
}
