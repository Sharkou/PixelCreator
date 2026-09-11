// Velocity — how fast an Object is going, and nothing else.
//
// IT IS NOT A PHYSICS ENGINE, AND THE ABSENCES ARE THE DESIGN. No gravity, no friction, no
// mass, no restitution, no solver, no rigid body. A creator who writes `X 100` gets an
// object that moves a hundred pixels to the right every second, and NOTHING they did not
// ask for happens to it. Every one of those extras is a decision about what a game IS, and
// a component called `Velocity` is not where a product makes them.
//
// PIXELS PER SECOND, NOT PER FRAME. `deltaTime` is the fixed simulation step (`Clock`), so
// the same value moves the same distance on a 60 Hz display, on a 144 Hz display and on a
// server with no display at all — which is the whole reason the step is fixed (ADR-0011).
// A component that added its numbers straight to the Transform would be the Legacy defect
// that makes a game run faster on a better monitor.
//
// IT IS AN ORDINARY COMPONENT, AND THAT IS WHY IT COSTS NOTHING. `update(self, ctx)` is the
// hook every component already has (ADR-0004): the runtime runs it in canonical order, skips
// it when the Object or the Component is switched off, isolates a throw, and serializes its
// two numbers like any other schema. There is no integration pass, no second loop and no
// system — `ParticleSystem` already proved the shape.
//
// LOCAL SPACE, LIKE `Translate` AND FOR THE SAME REASON (ADR-0002). `Transform.x` is a
// position in the PARENT's space, so a velocity is a speed in that space too: a crate moving
// on a boat moves relative to the boat. A world-space velocity would need the inverse of the
// parent's matrix and would quietly disagree with the number the Inspector shows.

export class Velocity {

    static type = 'Velocity';

    static schema = {
        x: { type: 'number', default: 0, unit: '/s' },
        y: { type: 'number', default: 0, unit: '/s' }
    };

    /**
     * Create the component.
     * @param {number} [x] - Horizontal speed, in units per second
     * @param {number} [y] - Vertical speed, in units per second
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Move the Object by one step's worth of speed.
     *
     * AN OBJECT WITH NO TRANSFORM HAS NO POSITION TO MOVE, and that is a state of the scene
     * rather than a fault: nothing is thrown, nothing is reported, and the next component
     * still runs (ADR-0034 §3.4, the family `Translate` already belongs to).
     *
     * @param {object} self - The owning object
     * @param {object} ctx - The step context: time, deltaTime, scene, input
     */
    update(self, ctx) {
        const transform = self.getComponent?.('Transform') ?? null;
        if (!transform) return;

        const elapsed = ctx?.deltaTime ?? 0;
        transform.x += this.x * elapsed;
        transform.y += this.y * elapsed;
    }
}
