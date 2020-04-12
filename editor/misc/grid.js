import { Camera } from '/src/core/camera.js';

export class Grid {
    
    static draw(ctx) {

        const camera = Camera.main;

        // Save the entire state of the canvas
        ctx.save();

        // Zoom
        ctx.scale(camera.scale, camera.scale);

        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();

        for (var i = -this._length; i < this._length; i += this.dt) {
            ctx.moveTo(-this._length + this.gap - camera.x, i + this.gap - camera.y);
            ctx.lineTo(this._length + this.gap - camera.x, i + this.gap - camera.y);
            ctx.moveTo(i + this.gap - camera.x, this._length + this.gap - camera.y);
            ctx.lineTo(i + this.gap - camera.x, -this._length + this.gap - camera.y);
        }

        ctx.stroke();

        // Restore the saved state of the canvas
        ctx.restore();
    }
}

Grid.dt = 30;
Grid._length = 3000;
Grid.lineWidth = 1;
Grid.gap = (Grid.lineWidth % 2 == 0) ? 0 : 0.5;
Grid.active = true;

const button = document.getElementById('gridBtn');

// Display ruler
button.addEventListener('click', () => {
    Grid.active = !Grid.active;
    button.classList.toggle('active');
});