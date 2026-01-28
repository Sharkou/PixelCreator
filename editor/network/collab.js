var Collab = {
    /** @type {Array<{name: string, x: number, y: number}>} Connected collaborators */
    friends: [],
    
    /** @type {{name: string, x: number, y: number}} Local user cursor */
    me: {
        name: 'Sharkou',
        x: 80,
        y: 60
    },
    
    /** @type {HTMLCanvasElement} Collaboration overlay canvas */
    canvas: $('collab'),
    
    /** @type {CanvasRenderingContext2D} Canvas 2D context */
    ctx: $('collab').getContext("2d"),
    
    /** @type {string} Cursor dot color */
    color: 'rgba(240, 220, 220, 0.5)',
    
    /**
     * Draw all collaborator cursors
     */
    draw: function() {
        this.clear();
        this.ctx.beginPath();
        for (var i = 0; i < this.friends.length; i++) {
            this.ctx.arc(this.friends[i].x, this.friends[i].y, 5, 0, 2 * Math.PI);
        }        
        this.ctx.fillStyle = this.color;
        this.ctx.fill();
    },
    
    /**
     * Clear the collaboration canvas
     */
    clear: function() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

Collab.canvas.width = window.innerWidth;
Collab.canvas.height = window.innerHeight;
Collab.canvas.style.position = 'absolute';
Collab.canvas.style.zIndex = '10';
Collab.canvas.style.pointerEvents = 'none';

Collab.friends.push(Collab.me);

Collab.canvas.addEventListener('mousemove', function(e) {
    var pos = getMousePos(e);
    Collab.me.x = pos.x;
    Collab.me.y = pos.y;
    log(Collab.me);
});

// var socket = io.connect('http://localhost:3000');

socket.on('message', function(message) {
    console.log(message);
});

socket.on('add', function(o) {
    o = parse(o);
    o = new window[o.type](o);
    // Scene.add(o);
    
    // Add to the scene
    Scene.objects[o.id] = o;
    var last = World.node.appendChild(o.view());
    Sorter.sort(last);
});

socket.on('updateName', function(s) {
    s = s.split('-');
    Scene.objects[s[0]].name = s[1];
});