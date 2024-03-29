export class Performance {

    static lastCalledTime = 0;
    static fps = 0;
    static timer = 0;
    static delta = 0;
    
    // Performance update
    static update() {
        this.delta = (Date.now() - this.lastCalledTime) / 1000;
        this.lastCalledTime = Date.now();
        if (Date.now() - this.timer > 150) {
            this.fps = 1 / this.delta;
            this.timer = Date.now();
        }
        this.smooth();
    }
    
    static smooth() {
        if (this.fps >= 50)
            this.fps = 60;
    }
    
    // Performance display
    static display(ctx) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = "12px 'Open Sans'";
        ctx.clearRect(0, 0, 30, 30);
        ctx.fillText('FPS', 5, 15);
        ctx.fillText(this.fps.toFixed(1), 5, 30);
    }
}