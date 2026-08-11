import { Graphics } from '/src/graphics/graphics.js';
import { Random } from '/src/math/random.js';

class Particle {
    
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 5;
        this.startRadius = 5;
        this.hue = 23;
        this.saturation = 75;
        this.lightness = 50;
        this.alpha = 0.05;
        this.startAlpha = 0.05;
        this.decayRate = 0.1;
        this.life = 7;
        this.startLife = 7;
        this.lineWidth = 1;
    }

    reset(originX, originY) {
        this.startRadius = Random.range(1, 25);
        this.radius = this.startRadius;
        this.x = originX + (Random.range(0, 6) - 3);
        this.y = originY;
        this.vx = 0;
        this.vy = 0;
        this.hue = 23;
        this.saturation = Random.range(50, 100);
        this.lightness = Random.range(20, 70);
        this.startAlpha = Random.range(1, 10) / 100;
        this.alpha = this.startAlpha;
        this.decayRate = 0.1;
        this.startLife = 7;
        this.life = this.startLife;
        this.lineWidth = Random.range(1, 3);
    }
}

export class ParticleSystem {
    
    /**
     * Initialize the particle system component
     * @constructor
     * @param {number} maxParticles - Maximum number of particles
     * @param {string} color - Base particle color
     */
    constructor(maxParticles = 200, color = '#f86f1c') {
        this.particles = [];
        this.maxParticles = maxParticles;
        this.color = color;
        this.emitting = true;
    }

    update(self) {
        if (!this.emitting) return;

        // Spawn particles up to max
        if (this.particles.length < this.maxParticles) {
            const p = new Particle();
            p.reset(self.width / 2, self.height);
            this.particles.push(p);
        }

        // Update each particle
        for (const p of this.particles) {
            p.vx += (Random.range(0, 200) - 100) / 1500;
            p.vy -= p.life / 50;
            p.x += p.vx;
            p.y += p.vy;
            p.alpha = p.startAlpha * (p.life / p.startLife);
            p.radius = p.startRadius * (p.life / p.startLife);
            p.life -= p.decayRate;

            if (p.x > self.width + p.radius ||
                p.x < -p.radius ||
                p.y > self.height + p.radius ||
                p.y < -p.radius ||
                p.life <= p.decayRate) {
                p.reset(self.width / 2, self.height);
            }
        }
    }

    draw(self) {
        if (!this.emitting) return;

        const ctx = Graphics.ctx;
        const saved = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';

        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(
                self.x - self.width / 2 + p.x,
                self.y - self.height / 2 + p.y,
                Math.max(0, p.radius),
                0,
                Math.PI * 2
            );
            ctx.fillStyle = ctx.strokeStyle = `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${p.alpha})`;
            ctx.lineWidth = p.lineWidth;
            ctx.fill();
            ctx.stroke();
        }

        ctx.globalCompositeOperation = saved;
    }
}