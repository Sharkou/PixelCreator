export class Lighting {

    /**
     * Dynamic 2D lighting system using Canvas 2D compositing
     * Renders a darkness overlay and subtracts light sources using globalCompositeOperation
     * @param {string} ambientColor - Base darkness color
     * @param {number} ambientOpacity - Darkness opacity (0-1)
     */
    constructor(ambientColor = '#000000', ambientOpacity = 0.85) {
        this.ambientColor = ambientColor;
        this.ambientOpacity = ambientOpacity;
        this.lights = [];
        this.offscreen = null;
        this.offCtx = null;
    }

    init(width, height) {
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = width;
        this.offscreen.height = height;
        this.offCtx = this.offscreen.getContext('2d');
    }

    resize(width, height) {
        if (this.offscreen) {
            this.offscreen.width = width;
            this.offscreen.height = height;
        }
    }

    addLight(light) {
        this.lights.push(light);
        return light;
    }

    removeLight(light) {
        const idx = this.lights.indexOf(light);
        if (idx !== -1) this.lights.splice(idx, 1);
    }

    clearLights() {
        this.lights.length = 0;
    }

    /**
     * Render the lighting overlay onto the main canvas
     * @param {CanvasRenderingContext2D} ctx - The main canvas context
     * @param {object} camera - Camera with x, y, width, height, scale
     */
    render(ctx, camera) {
        if (!this.offCtx) return;

        const oc = this.offCtx;
        const w = this.offscreen.width;
        const h = this.offscreen.height;

        // Fill darkness
        oc.globalCompositeOperation = 'source-over';
        oc.fillStyle = this.ambientColor;
        oc.globalAlpha = this.ambientOpacity;
        oc.fillRect(0, 0, w, h);
        oc.globalAlpha = 1;

        // Subtract lights from darkness
        oc.globalCompositeOperation = 'destination-out';

        for (const light of this.lights) {
            const sx = (light.x - camera.x) * camera.scale;
            const sy = (light.y - camera.y) * camera.scale;
            const sr = light.radius * camera.scale;

            const grad = oc.createRadialGradient(sx, sy, 0, sx, sy, sr);
            grad.addColorStop(0, `rgba(255,255,255,${light.intensity})`);
            grad.addColorStop(0.4, `rgba(255,255,255,${light.intensity * 0.6})`);
            grad.addColorStop(1, 'rgba(255,255,255,0)');

            oc.fillStyle = grad;
            oc.beginPath();
            oc.arc(sx, sy, sr, 0, Math.PI * 2);
            oc.fill();
        }

        // Colored light pass (additive)
        oc.globalCompositeOperation = 'source-atop';
        for (const light of this.lights) {
            if (light.color && light.color !== '#ffffff') {
                const sx = (light.x - camera.x) * camera.scale;
                const sy = (light.y - camera.y) * camera.scale;
                const sr = light.radius * camera.scale;

                const grad = oc.createRadialGradient(sx, sy, 0, sx, sy, sr);
                grad.addColorStop(0, light.color);
                grad.addColorStop(1, 'rgba(0,0,0,0)');

                oc.globalAlpha = 0.3;
                oc.fillStyle = grad;
                oc.beginPath();
                oc.arc(sx, sy, sr, 0, Math.PI * 2);
                oc.fill();
                oc.globalAlpha = 1;
            }
        }

        oc.globalCompositeOperation = 'source-over';

        // Composite onto main canvas
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.offscreen, 0, 0);
        ctx.restore();
    }
}

export class LightSource {

    /**
     * A point light source
     * @param {number} x - World x position
     * @param {number} y - World y position
     * @param {number} radius - Light radius in world units
     * @param {number} intensity - Light intensity (0-1)
     * @param {string} color - Light color
     * @param {boolean} flicker - Enable flickering
     */
    constructor(x = 0, y = 0, radius = 80, intensity = 1, color = '#ffffff', flicker = false) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.baseRadius = radius;
        this.intensity = intensity;
        this.baseIntensity = intensity;
        this.color = color;
        this.flicker = flicker;
        this.flickerTimer = Math.random() * 100;
        this.flickerSpeed = 0.1;
        this.flickerAmount = 0.15;
    }

    update() {
        if (this.flicker) {
            this.flickerTimer += this.flickerSpeed;
            const f = Math.sin(this.flickerTimer) * 0.5 + Math.sin(this.flickerTimer * 2.3) * 0.3 + Math.sin(this.flickerTimer * 5.7) * 0.2;
            this.radius = this.baseRadius * (1 + f * this.flickerAmount);
            this.intensity = this.baseIntensity * (1 + f * this.flickerAmount * 0.5);
        }
    }
}
