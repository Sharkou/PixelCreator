var Button = function(x, y, text, color)
{
    GameObject.call(this);
    
    this._name = "New Button";
    // this.type = "button";
    this.text = text;
    this.node;
    
    this.addComponent(new UIPosition(x, y));
    this.addComponent(new UISize(100, 20));
    this.addComponent(new UIAppearance(color));
    
    this.position = this.components.position;
    
    this.draw = function(canvas) {
        if (!this.node) {
            var node = document.createElement('button');
            var text = document.createTextNode(this.text);
            node.appendChild(text);
            this.node = node;
            canvas.node.parentElement.appendChild(node);
        }        
    };
    
};

// Button.prototype = Object.create(GameObject.prototype);