import { Node } from '/editor/graph/node.js';

export class Graph {
    
    static main = null;

    /**
     * Initialize the visual scripting graph
     */
    constructor() {
        Graph.main = this;
        this.nodes = {};
        this.boxes = document.getElementsByClassName('box');
        this.graph = document.getElementById('graph');
        this.content = document.getElementById('graph-content'); // holds nodes + svg, transformed together for zoom/pan
        this.svg = document.getElementById('svg');
        this.currentConnector = null;
        this.currentNode = null;
        this.code = '';

        // Zoom & pan state (view transform only, node coordinates stay untouched)
        this.zoom = 1;
        this.minZoom = 0.25;
        this.maxZoom = 2;
        this.panX = 0;
        this.panY = 0;
        this.panning = false;
        this.panStart = { x: 0, y: 0 };
        this.updateTransform();

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

        // Right-click drag pans the view; block the native context menu in the graph
        this.graph.addEventListener('contextmenu', e => {
            e.preventDefault();
        });

        this.graph.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = this.graph.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const prevZoom = this.zoom;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, prevZoom * factor));
            if (newZoom === prevZoom) return;
            // keep the point under the cursor fixed while zooming
            this.panX = mouseX - (mouseX - this.panX) * (newZoom / prevZoom);
            this.panY = mouseY - (mouseY - this.panY) * (newZoom / prevZoom);
            this.zoom = newZoom;
            this.updateTransform();
        }, { passive: false });

        this.graph.addEventListener('mousedown', e => {
            if (e.button === 2) {
                // Only pan when starting from the background, not from a node/connector
                if (e.target.closest('.node')) return;
                this.panning = true;
                this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', e => {
            if (this.panning) {
                this.panX = e.clientX - this.panStart.x;
                this.panY = e.clientY - this.panStart.y;
                this.updateTransform();
            }
        });

        window.addEventListener('mouseup', e => {
            if (e.button === 2) {
                this.panning = false;
            }
        });

        // DOM Event handlers
        this.graph.addEventListener('mousedown', e => {
            if (e.button !== 0) return; // left click only, right click is reserved for panning
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
                // Use logical (zoom-independent) coordinates so dragging stays accurate at any zoom level
                const pos = this.getMousePos(e);
                this.currentNode.offsetX = pos.x - (parseFloat(this.currentNode.el.style.left) || 0);
                this.currentNode.offsetY = pos.y - (parseFloat(this.currentNode.el.style.top) || 0);
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
                let connectorPoint = this.getConnectorPos(this.currentConnector);
                let mousePoint = { x, y };
                // dragging from an output bows right, from an input bows left
                let s = this.currentConnector.classList.contains('output')
                    ? this.createPath(connectorPoint, mousePoint, 1, -1)
                    : this.createPath(connectorPoint, mousePoint, -1, 1);
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
        this.content.appendChild(node.el);
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

    /**
     * Build a horizontal Bezier path between two points.
     * a is expected to face left (input, aDir -1) and b to face right (output, bDir 1) by default.
     * @param {{x:number,y:number}} a - Start point
     * @param {{x:number,y:number}} b - End point
     * @param {number} aDir - Horizontal direction the curve leaves `a` in (-1 left, 1 right)
     * @param {number} bDir - Horizontal direction the curve leaves `b` in (-1 left, 1 right)
     */
    createPath(a, b, aDir = -1, bDir = 1) {

        const distance = Math.abs(b.x - a.x);
        const offset = Math.max(50, distance * 0.4);

        const x1 = a.x + offset * aDir;
        const y1 = a.y;

        const x2 = b.x + offset * bDir;
        const y2 = b.y;

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

    // Returns the connector's center in logical (unzoomed/unpanned) graph coordinates,
    // matching the coordinate space nodes are positioned in.
    getConnectorPos(connector) {
        const rect = connector.getBoundingClientRect();
        return this.toLocalPos(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    getOffset(el) {
        const rect = el.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top
        };
    }

    getMousePos(e) {
        return this.toLocalPos(e.clientX, e.clientY);
    }

    // Converts screen (client) coordinates into logical graph-content coordinates,
    // undoing the current pan/zoom view transform.
    toLocalPos(clientX, clientY) {
        const rect = this.graph.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this.panX) / this.zoom,
            y: (clientY - rect.top - this.panY) / this.zoom
        };
    }

    updateTransform() {
        this.content.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
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