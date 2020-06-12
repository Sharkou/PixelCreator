import { Camera } from '/src/core/camera.js';

export class Grid {

    static dt = 30;
    static length = 400;
    static height = 400;
    static dashLimit = 3500; // prevent lag
    static dashfull = 4;
    static dashvoid = 2;
    static dashtotal = this.dashfull+this.dashvoid;
    static lineWidth = 1;
    static gap = (Grid.lineWidth % 2 == 0) ? 0 : 0.5;
    static active = true;
    
    static draw(ctx) {

        const camera = Camera.main;
        const canvas = document.getElementById('canvas');
        this.length = canvas.width;
        this.height = canvas.height;

        // Save the entire state of the canvas
        ctx.save();

        // Zoom
        ctx.scale(camera.scale, camera.scale);

        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();

        let max1 = this.length*(1/camera.scale)+3*this.dt;
        let max2 = this.height*(1/camera.scale)+3*this.dt;
        if (max1+max2 < this.dashLimit)
        {
            ctx.setLineDash([this.dashfull, this.dashvoid]);
        }
        for (var i = -0.5*this.dt; i < max1; i += this.dt) {
        ctx.moveTo(i - (camera.x%this.dt), max2 - (camera.y%this.dt));
        ctx.lineTo(i - (camera.x%this.dt), -max1 - (camera.y%this.dt));
        }
        for (var i = -0.5*this.dt; i < max2; i += this.dt) {
            ctx.moveTo(-max2 - (camera.x%this.dt), i - (camera.y%this.dt));
            ctx.lineTo(max1 - (camera.x%this.dt), i - (camera.y%this.dt));
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