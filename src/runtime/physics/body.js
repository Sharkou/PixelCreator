// A Body — "this Object moves, and the world can stop it" (ADR-0067).
//
// THREE WORDS, AND A BEGINNER CAN POINT AT EACH OF THEM ON SCREEN:
//
//   Body            this Object moves, and solid things stop it
//   Collider solid  this box blocks whatever has a Body
//   Collider not    this box only detects — it still fires On Collision
//
// That is the whole model. There is no mass, no restitution, no friction, no torque, no
// joint and no physical rotation, because every one of them is a decision about what a game
// IS and none of them is needed to stand on a floor (ADR-0067 §6 lists them as refused, not
// as forgotten).
//
// IT CARRIES NO SPEED OF ITS OWN. `Velocity` already says how fast an Object is going, in
// the Inspector, in the schema, in `Get Property` and in every scene already saved — a
// second pair of numbers here would be two answers to one question, and the one the creator
// could see would be the wrong one half the time. So a Body with no Velocity does not move,
// exactly as a `SpriteAnimator` with no `Sprite` shows nothing (ADR-0062 §4).
//
// IT HAS NO `update()`, AND THAT IS THE POINT (ADR-0067 §4). Moving a body has to happen
// AFTER every graph in the step has had its say, or a key pressed this step would change a
// velocity that was already integrated and the character would answer one frame late. So the
// movement is a PASS the Runtime runs at the end of the step, and this component is what the
// pass looks for — state and declaration, not behaviour.

export class Body {

    static type = 'Body';

    static schema = {
        // DOWN IS POSITIVE Y, like every other coordinate in this engine. A platformer types
        // a number here; a top-down game leaves it at zero and gets nothing it did not ask
        // for, which is the rule `Velocity` has stated since it was written.
        gravity: {
            type: 'number',
            default: 0,
            unit: '/s²',
            tooltip: 'Downward acceleration added to Velocity every second. 0 for a top-down game'
        },
        // COMPUTED, THEREFORE READ-ONLY (ADR-0067 §5). It is the answer to "is it standing on
        // something", which only the pass that stopped it can know. A creator reads it with
        // `Get Property` to gate a jump; writing it would be writing down an opinion about
        // the world that the next step overwrites.
        grounded: {
            type: 'boolean',
            default: false,
            readonly: true,
            tooltip: 'True while a solid stopped this Body on its way down'
        }
    };

    /**
     * Create the component.
     * @param {number} [gravity] - Downward acceleration, in units per second squared
     */
    constructor(gravity = 0) {
        this.gravity = gravity;
        this.grounded = false;
    }
}
