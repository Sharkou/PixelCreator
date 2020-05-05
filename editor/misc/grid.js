import { Camera } from '/src/core/camera.js';

export class Grid {

    static dt = 30;
    static length = 600;
    static lineWidth = 1;
    static gap = (Grid.lineWidth % 2 == 0) ? 0 : 0.5;
    static active = true;
    
    static draw(ctx) {

        const camera = Camera.main;

        // Save the entire state of the canvas
        ctx.save();

        // Zoom
        ctx.scale(camera.scale, camera.scale);

        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();
        ctx.setLineDash([4, 2]);

        for (var i = -this.length; i < this.length; i += this.dt) {
            ctx.moveTo(-this.length + this.gap - camera.x, i + this.gap - camera.y);
            ctx.lineTo(this.length + this.gap - camera.x, i + this.gap - camera.y);
            ctx.moveTo(i + this.gap - camera.x, this.length + this.gap - camera.y);
            ctx.lineTo(i + this.gap - camera.x, -this.length + this.gap - camera.y);
        }

        ctx.stroke();

        // Restore the saved state of the canvas
        ctx.restore();
    }
}

const button = document.getElementById('gridBtn');

// Display ruler
button.addEventListener('click', () => {
    Grid.active = !Grid.active;
    button.classList.toggle('active');
});