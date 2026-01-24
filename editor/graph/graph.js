import { Node } from '/editor/graph/node.js';

export class Graph {
    
    /**
     * Initialize Graph (visual scripting)
     * @constructor
     */
    constructor() {
        this.nodes = {};
        this.boxes = document.getElementsByClassName('box');
        this.graph = document.getElementById('graph');
        this.svg = document.getElementById('svg');
        this.currentConnector = null;
        this.currentNode = null;
        this.code = '';

        this.graph.addEventListener('dragover', e => {
            e.preventDefault(); // annule l'interdiction de "drop"
            e.target.classList.add('drop_hover');
        }, false);
        
        this.graph.addEventListener('dragleave', e => {
            e.target.classList.remove('drop_hover');
        });
        
        this.graph.addEventListener('dragend', e => {
            e.target.classList.remove('drop_hover');
        });
        
        this.graph.addEventListener('drop', e => {
            e.preventDefault();
            e.target.classList.remove('drop_hover');
            this.createNode(e.dataTransfer.getData('text'), this.getMousePos(e));
        }, false);

        // Parcourt l'ensemble des boites pour leur attribuer des events drag
        for (let box of this.boxes) {
            box.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text', e.target.id);
            });
        }

        // DOM Event handlers
        this.graph.addEventListener('mousedown', e => {
            if (e.target.classList.contains('connector')) {
                const connector = e.target;
                const otherConnector = connector.other;
                this.deletePath(otherConnector);
                // connector.node.detachConnector(connector);
                this.currentConnector = connector;
                // if (connector.path.hasAttribute('d')) {
                //     connector.path.removeAttribute('d');
                // }
            } else if (e.target.classList.contains('node')) {
                this.currentNode = this.nodes[e.target.id];
                this.currentNode.offsetX = e.offsetX;
                this.currentNode.offsetY = e.offsetY;
            }
        });

        this.graph.addEventListener('mouseup', e => {
            this.currentNode = null;
            let updateConnectorPos = false;
            // S'il y a connexion
            if (this.currentConnector && e.target.classList.contains('connector')) {
                const otherConnector = e.target;
                const node = this.currentConnector.node;
                if (!node.ownsInput(otherConnector) && !node.ownsOutput(otherConnector)) {
                    if (this.currentConnector.classList.contains('input') && otherConnector.classList.contains('output')) {
                        this.connect(this.currentConnector, otherConnector);
                        updateConnectorPos = true;
                    } else if (this.currentConnector.classList.contains('output') && otherConnector.classList.contains('input')) {
                        this.connect(otherConnector, this.currentConnector);
                        updateConnectorPos = true;
                    } else {
                        this.deletePath(this.currentConnector);
                    }
                } else {
                    this.deletePath(this.currentConnector);
                }
            } else if (this.currentConnector) {
                this.deletePath(this.currentConnector);
            }
            if (this.currentConnector) {
                let path = this.currentConnector.path;
                path.removeAttribute('d');
                if (updateConnectorPos) {
                    this.currentConnector.node.updateConnectorsPos();
                }
            }
            this.currentConnector = null;
        });

        this.graph.addEventListener('mousemove', e => {
            // e.stopPropagation();
            let { x, y } = this.getMousePos(e);
            x = Math.round(x);
            y = Math.round(y);
            if (this.currentConnector) {
                let path = this.currentConnector.path;
                let inputPoint = this.getConnectorPos(this.currentConnector);
                let outputPoint = { x, y };
                let s = this.createPath(inputPoint, outputPoint);
                path.setAttribute('d', s);
            } else if (this.currentNode) {
                this.currentNode.moveTo({
                    x: x - this.currentNode.offsetX,
                    y: y - this.currentNode.offsetY
                });
            }
        });
    }

    /**
     * Create new node
     * @param {string} type - The node type
     */
    createNode(type, e) {
        const node = new Node(type);
        this.graph.appendChild(node.el);
        node.moveTo({
            x: e.x - node.el.offsetWidth / 2,
            y: e.y - node.el.offsetHeight / 2
        });
        this.nodes[node.id] = node;

        this.updateScript();
    }

    deleteNode(id) {
        this.updateScript();
    }

    createPath(a, b) {
        // let x1 = (b.x - a.x) * 0.4 + a.x;
        // let y1 = a.y;
        // let x2 = (b.x - a.x) * 0.6 + a.x;
        // let y2 = b.y;

        let x1 = a.x;
        let y1 = (b.y - a.y) * 0.9 + a.y;
        let x2 = b.x;
        let y2 = (b.y - a.y) * 0.1 + a.y;

        let path = `M ${a.x} ${a.y} C ${x1} ${y1}, ${x2} ${y2}, ${b.x} ${b.y}`;
          
        return path;
    }

    deletePath(connector) {
        if (connector) {
            connector.path.removeAttribute('d');
            connector.classList.remove('filled');
            connector.classList.remove('connected');
            connector.classList.add('empty');
            connector.node.detachConnector(connector);
        }

        this.updateScript();
    }

    addConnectorPath(path) {
        this.svg.appendChild(path);
    }

    connect(input, output) {

        const connect = function(connector) {
            connector.connected = true;
            connector.classList.add('connected');
            connector.classList.remove('empty');
            connector.classList.add('filled');
        };

        connect(input);
        connect(output);

        input.other = output;
        output.other = input;

        input.node.attachedPaths.push({
            input,
            output,
            path: input.path
        });

        output.node.attachedPaths.push({
            input,
            output,
            path: input.path
        });
        
        // var iPoint = this.getConnectorPos(input);
        // var oPoint = this.getConnectorPos(output);
        
        // var path = Graph.createPath(iPoint, oPoint);
        
        // input.path.setAttribute('d', path);

        this.updateScript();
    }

    getConnectorPos(connector) {
        // let connector = this.el.firstElementChild;
        const offset = this.getOffset(connector);
        const rect = this.getOffset(this.graph);
        // const node = connector.node.el;
        return {
            x: offset.left - rect.left + connector.offsetWidth / 2 + this.graph.scrollLeft,
            y: offset.top - rect.top + connector.offsetHeight / 2 + this.graph.scrollTop
        };
    }

    getOffset(el) {
        const rect = el.getBoundingClientRect();
        return {
            left: rect.left - this.graph.scrollLeft,
            top: rect.top - this.graph.scrollTop
        };
    }

    getMousePos(e) {
        const rect = this.getOffset(this.graph);
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }

    // static getAttachPoint(connector) {
    //     let offset = this.getOffset(connector);
    //     return {
    //         x: offset.left + connector.offsetWidth - 2,
    //         y: offset.top + connector.offsetHeight / 2
    //     };
    // }

    /**
     * Update PixelScript content
     */
    updateScript(id, code) {
        console.log(this.nodes);
        this.code = '';
        // let script = Project.files[id];
        // script.data = Compiler.compile(code);
        // Compiler.update(script);
    }
}