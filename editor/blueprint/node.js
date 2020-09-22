import { System } from '/src/core/system.js';
import { Graph } from '/editor/blueprint/graph.js';

export class Node {
    
    /**
     * Create Node in blueprint editor
     * @constructor
     * @param {string} type - The node type
     */
    constructor(type) {
        this.id = System.createID();
        this.type = type;
        this.value = '';
        this.inputs = [];
        this.outputs = [];
        this.connected = false;
        this.attachedPaths = []; // SVG Connections
        this.createView();
    }

    /**
     * Create DOM Element
     * @param {string} type - The node type
     */
    createView() {
        this.el = document.createElement('div');
        this.el.id = this.id;
        this.el.classList.add('node');
        this.el.setAttribute('title', this.type);

        // Create text span
        let span = document.createElement('span');
        span.setAttribute('contenteditable', true);
        span.setAttribute('spellcheck', false);
        span.setAttribute('autocomplete', 'off');
        span.textContent = this.type;

        span.addEventListener('keypress', function(e) {
            System.validate(this, e);
        });

        span.addEventListener('focusout', () => {
            window.getSelection().removeAllRanges();
        });
        
        // Create input visual
        let input = this.createConnector('input', 'standard input');
        input.classList.add('input');

        // Create output visual
        let output = this.createConnector('output', 'standard output');
        output.classList.add('output');

        // Create output error visual
        // let error = this.createConnector('error', 'standard error');
        // error.classList.add('output');

        this.el.addEventListener('drag', e => {
            this.updateConnectorsPos();
        });

        this.el.appendChild(span);
        this.el.appendChild(input);
        this.el.appendChild(output);

        return this.el;
    }

    createConnector(type, name) {
        // The dom element, here is where we could add different input types
        let connector = document.createElement('div');
        connector.node = this;
        connector.setAttribute('title', name);
        connector.classList.add(type);
        connector.classList.add('connector');
        connector.classList.add('empty');

        switch (type) {
            case 'input':
                this.inputs.push(connector);
                break;
            
            case 'output':
                this.outputs.push(connector);
                break;

            case 'error':
                break;
        }
            
        // SVG Connector
        connector.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        connector.path.classList.add('connection');
        Graph.svg.appendChild(connector.path);
        
        // DOM Event handlers
        connector.addEventListener('mousedown', e => {
            // Graph.currentConnector = connector;
            connector.classList.add('filled');
            // e.stopPropagation();
        });

        connector.addEventListener('mouseup', e => {
            connector.classList.remove('filled');
        });

        return connector;
    }

    detachConnector(connector) {
        // let index = -1;
        const other = connector.other;
        const otherPaths = other?.node.attachedPaths;
        // console.log(connector.node);

        for (let i = 0; i < this.attachedPaths.length; i++) {
            if (this.attachedPaths[i].input == connector || this.attachedPaths[i].output == connector) {
                this.attachedPaths.splice(i, 1);
            }
        }

        if (otherPaths) {
            for (let i = 0; i < otherPaths.length; i++) {
                if (otherPaths[i].input == other || otherPaths[i].output == other) {
                    otherPaths.splice(i, 1);
                }
            }
        }
        
        // if (index >= 0) {
        //     this.attachedPaths[index].path.removeAttribute('d');            
        //     // this.attachedPaths[index].connector.node = null;
        //     this.attachedPaths.splice(index, 1);
        // }
        
        // if (this.attachedPaths.length <= 0) {
        //     this.el.classList.remove('connected');
        // }
    }

    ownsInput(connector) {
        for (let i = 0; i < this.inputs.length; i++) {
            if (this.inputs[i] == connector) {
                return true;
            }
        }
        return false;
    }

    ownsOutput(connector) {
        for (let i = 0; i < this.outputs.length; i++) {
            if (this.outputs[i] == connector) {
                return true;
            }
        }
        return false;
    }

    updateConnectorsPos() {
        let paths = this.attachedPaths;

        for (let i = 0; i < paths.length; i++) {
            let iPoint = Graph.getConnectorPos(paths[i].input);
            let oPoint = Graph.getConnectorPos(paths[i].output);
            let path = Graph.createPath(iPoint, oPoint);
            paths[i].path.setAttribute('d', path);
        }
        
        // for (let i = 0; i < this.inputs.length; i++) {
        //     if (this.inputs[i].node != null) {
        //         let iP = Graph.getConnectorPos(this.inputs[i]);
        //         let oP = Graph.getConnectorPos(this.inputs[i]); // this.inputs[i].node.getConnectorPos();
        //         let pStr = Graph.createPath(iP, oP);
        //         this.inputs[i].path.setAttribute('d', pStr);
        //     }
        // }
    }

    moveTo(pos) {
        const gapX = pos.x % 10;
        const gapY = pos.y % 10;
        // TODO: utiliser translate
        this.el.style.left = pos.x - gapX + 'px';
        this.el.style.top = pos.y - gapY + 'px';
        this.updateConnectorsPos();
    }
}