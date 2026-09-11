// Public entry point of the runtime.
//
// The runtime depends on the core; the core never depends on the runtime. Everything
// here runs unchanged on a server, except that a server builds a Runtime without a
// renderer and therefore never draws.

export { Runtime } from './runtime.js';
export { registerBuiltIns } from './builtins.js';
export { Clock } from './clock/clock.js';
export { componentFailure, rethrowLater } from './errors.js';

export { Input, InputState, LOCAL } from './input/input.js';
export { Random, advance, unitOf } from './random/random.js';
export { Velocity } from './components/velocity.js';
export {
    AUDIO_OPERATIONS,
    SilentAudio,
    assertAudioOutput,
    missingAudioOperations,
    volumeOf
} from './audio/audio.js';
export { HtmlAudioOutput } from './audio/html-audio.js';
export { AudioSource } from './audio/audio-source.js';
export { BoxCollider, boxesOverlap, worldBox } from './collision/collider.js';
export { Collisions, CollisionPhase } from './collision/collisions.js';
export { Behaviors } from './scripting/behaviors.js';
export { DEFAULT_BUDGET, createGraphInterpreter, interpretGraph } from './scripting/interpreter.js';

export { BlendMode, RENDERER_OPERATIONS, missingOperations, assertRenderer } from './rendering/renderer.js';
export { Canvas2DRenderer } from './rendering/canvas2d.js';
export { SceneRenderer } from './rendering/scene-renderer.js';
export { Viewport } from './rendering/viewport.js';
export { Camera, activeCamera, viewMatrix, worldToScreen, screenToWorld } from './rendering/camera.js';
export { DrawSpace, ScreenSpace, drawSpaceOf } from './rendering/space.js';

export { RectangleRenderer } from './rendering/components/rectangle-renderer.js';
export { AVERAGE_ADVANCE, TextRenderer } from './rendering/components/text-renderer.js';
export { Sprite } from './rendering/components/sprite.js';
export { ParticleSystem } from './rendering/components/particle-system.js';
export { Tilemap } from './rendering/components/tilemap.js';
