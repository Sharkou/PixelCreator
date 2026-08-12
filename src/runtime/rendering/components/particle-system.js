// Particles: the component that proves the contract holds.
//
// It simulates in `update()` and draws in `draw()`, which is why both hooks exist
// (ADR-0004). A server runs the simulation and never calls draw; a client runs both.
// Nothing about it is special-cased by the runtime or the renderer — it produces
// hundreds of primitives through exactly the same interface a rectangle uses.
//
// Particles are runtime state, never project data: the schema describes the emitter,
// not the live particles, so a saved project stores the settings and not a snapshot of
// whatever happened to be on screen.

import { BlendMode } from '../renderer.js';

export class ParticleSystem {

    static type = 'ParticleSystem';

    static schema = {
        max: { type: 'number', default: 100, min: 0 },
        rate: { type: 'number', default: 20, min: 0, unit: '/s' },
        lifetime: { type: 'number', default: 1, min: 0, unit: 's' },
        speed: { type: 'number', default: 40 },
        spread: { type: 'number', default: Math.PI * 2, unit: 'rad' },
        radius: { type: 'number', default: 3, min: 0 },
        color: { type: 'color', default: '#ffaa33' },
        gravity: { type: 'number', default: 0 },
        additive: { type: 'boolean', default: true },
        emitting: { type: 'boolean', default: true }
    };

    /**
     * Create the emitter.
     * @param {object} [settings] - Emitter settings, see the schema
     */
    constructor(settings = {}) {
        this.max = settings.max ?? 100;
        this.rate = settings.rate ?? 20;
        this.lifetime = settings.lifetime ?? 1;
        this.speed = settings.speed ?? 40;
        this.spread = settings.spread ?? Math.PI * 2;
        this.radius = settings.radius ?? 3;
        this.color = settings.color ?? '#ffaa33';
        this.gravity = settings.gravity ?? 0;
        this.additive = settings.additive ?? true;
        this.emitting = settings.emitting ?? true;

        // Live state, deliberately outside the schema.
        this.particles = [];
        this.pending = 0;
        this.seed = 1;
    }

    /**
     * Advance the simulation by one fixed step.
     * @param {object} self - The owning object
     * @param {object} ctx - { time, deltaTime, scene, runtime }
     */
    update(self, ctx) {
        const dt = ctx.deltaTime;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.life -= dt;
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            particle.vy += this.gravity * dt;
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
        }

        if (!this.emitting) return;

        this.pending += this.rate * dt;
        while (this.pending >= 1 && this.particles.length < this.max) {
            this.pending -= 1;
            this.emitOne();
        }
        if (this.particles.length >= this.max) this.pending = 0;
    }

    /**
     * Draw every live particle.
     * @param {object} self - The owning object
     * @param {object} renderer - The renderer backend
     */
    draw(self, renderer) {
        if (this.particles.length === 0) return;

        if (this.additive) renderer.setBlendMode(BlendMode.ADDITIVE);

        for (const particle of this.particles) {
            const remaining = particle.life / this.lifetime;
            renderer.fillCircle(particle.x, particle.y, this.radius * remaining, {
                color: this.color,
                alpha: remaining
            });
        }

        if (this.additive) renderer.setBlendMode(BlendMode.NORMAL);
    }

    /** Remove every live particle. */
    clear() {
        this.particles.length = 0;
        this.pending = 0;
    }

    /** Spawn one particle. Prototype methods are never serialized. */
    emitOne() {
        const angle = (this.nextRandom() - 0.5) * this.spread;
        const speed = this.speed * (0.5 + this.nextRandom() * 0.5);

        this.particles.push({
            x: 0,
            y: 0,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: this.lifetime
        });
    }

    /** Deterministic pseudo-random source, advanced in place. */
    nextRandom() {
        // Deterministic on purpose: the same steps must produce the same particles on
        // a server and on every client. Math.random() would make the simulation diverge
        // between machines, which is exactly what a replicated runtime cannot afford.
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
}
