// import { Handler } from '/src/editor/system/handler.js';

export class Mouse {
        
    // Mouse position
    static getMousePos(e) {
        
        var rect = canvas.getBoundingClientRect();

        return {
            x: (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width,
            y: (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height
        };
    }
        
    static setButton(e) {
        switch (e) {
            case 0:
                this.button = 'left';
                break;
            case 2:
                this.button = 'right';
                break;
        }
    }
}

Mouse.x = 0;
Mouse.y = 0;
Mouse.target = null;
Mouse.down = false;
Mouse.up = false;
Mouse.move = false;
Mouse.button = '';
Mouse.editor = {
    x: 0,
    y: 0
};
Mouse.lastPosition = {
    x: 0,
    y: 0
};
Mouse.offset = {
    x: 0,
    y: 0
};
Mouse.world = {
    x: 0,
    y: 0
};

/*Canvas.node.addEventListener('mousedown', function(e) {
    Mouse.setButton(e.button);
    Mouse.down = true;
    Mouse.up = false;
});

Canvas.node.addEventListener('mouseup', function(e) {
    Mouse.setButton(e.button);
    Mouse.down = false;
    Mouse.up = true;
});*/

document.addEventListener('click', function(e) {
    Mouse.target = e.target;
});

/*(function() {
    var thread;
    
    Canvas.node.addEventListener('mousemove', function(e) {
        Mouse.move = true;
        
        if (thread) {
            clearTimeout(thread);
        }
        
        // on mouse stop
        thread = setTimeout(function() {
            Mouse.move = false;
        }, 100);
    });
})();*/

document.body.addEventListener('mouseup', (e) => {
    Mouse.editor.x = e.clientX;
    Mouse.editor.y = e.clientY;
})