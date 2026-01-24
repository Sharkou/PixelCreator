import { System } from '/src/core/system.js';
// import { Graph } from '/editor/graph/graph.js';
import { Graph } from '/app.js';
import { Compiler } from '/editor/graph/compiler.js';

export class Node {
    
    /**
     * Create Node in graph editor
     * @constructor
     * @param {string} type - The node type
     */
    constructor(type) {
        this.id = System.createID();
        this.type = type;
        this.value = type;
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

        // Create content
        let div = document.createElement('div');
        let text = document.createElement('span');
        div.classList.add('content');
        div.setAttribute('contenteditable', true);
        div.setAttribute('spellcheck', false);
        div.setAttribute('autocomplete', 'off');
        text.classList.add('command');
        text.dataset.value = this.type;
        text.textContent = this.type;
        div.appendChild(text);

        div.addEventListener('keypress', function(e) {
            System.validate(this, e);
        });

        div.addEventListener('focusout', () => {
            window.getSelection().removeAllRanges();
        });

        div.addEventListener('input', e => {
            const forbidden = /\+|\-|\*|\/|>|>=|<|<=|!=|=|\||&|;|\{|\}|\(|\)|\[|\]|\?|,|\.|:|!|\^|\s/;
            // TODO: all except
            // const forbidden = /(?!([a-zA-Z_$]+)).*/;
            const authorized = /^[a-zA-Z_$0-9]+/;

            const content = e.target.textContent; // .replace(/&nbsp;/g, ' ');
            // const tokens = content.split('');
            const fields = content.split(forbidden)
                                  .filter(str => str.match(authorized))
                                  .map(str => str.trim()); // str.replace(forbidden, ''));
            const length = fields.length;
            // const size = 8.05; // Size of character
            
            // Création d'un <span> pour chaque champ
            let html = '';
            let variable = false;
            let token = '';
            let field = 1;
            if (content.indexOf(' ') === -1) {
                if (fields[0][0] === '$') {
                    html = `<code class="command variable" data-value="${fields[0]}">${content}</code>`;
                } else {
                    html = `<span class="command" data-value="${fields[0]}">${content}</span>`; // '<span data-value="' + fields[0] + '>' + content + '</span>';
                }
            } else {
                if (fields[0][0] === '$') {
                    html = `<code class="command variable" data-value="${fields[0]}">${content.substr(0, content.indexOf(' '))}</code>`;
                } else {
                    html = `<span class="command" data-value="${fields[0]}">${content.substr(0, content.indexOf(' '))}</span>`;
                }
            }
            
            for (let i = content.indexOf(' '); i < content.length; i++) {
                if (!content[i]) break;
                token = content[i];
                if (token.match(forbidden) || token === ' ') {
                    html += token;
                } else {
                    if (token === '$') {
                        variable = true;
                        html += `<code class="field variable" data-value="${fields[field]}">`;
                    } else {
                        html += `<span class="field" data-value="${fields[field]}">`;
                    }
                    for (let j = i; j < content.length; j++) {
                        if (!content[j]) break;
                        token = content[j];
                        if (token.match(authorized)) {
                            html += token;
                        } else {
                            i--;
                            break;
                        }
                        i++;
                    }
                    if (variable) {
                        html += '</code>';
                    } else {
                        html += '</span>';
                    }
                    field++;
                    variable = false;
                }
            }

            let { container, range } = this.getCaret();
            let index = 0;
            // let indices = {};
            let textNode = container.parentNode?.classList.contains('content');

            container = container.parentNode.classList.contains('content') ? container : container.parentNode;

            // console.log(container);

            // Gestion des espaces et suppressions
            if (!e.data?.match(authorized)) {
                if (e.inputType == 'deleteContentBackward') {
                    
                } else if (e.inputType == 'deleteContentForward') {

                } else {
                    if (!textNode) {
                        index++;
                        range = 1;
                    }
                }
            } else {
                if (textNode) {
                    index++;
                    range = 1;
                }
            }
            
            while((container = container.previousSibling) != null) {
                index++;
            }

            e.target.innerHTML = html;

            this.setCaret(index, range);

            // console.log(`${fields.length} fields: ${fields}`);

            // index = 0;

            // Création et actualisation des connecteurs
            for (let i = 1; i < fields.length; i++) {

                if (!this.inputs[i]) {
                    this.el.appendChild(this.createConnector('input', fields[i]));
                    this.inputs[i].dataset.value = fields[i];
                } else {
                    this.inputs[i].setAttribute('title', fields[i]);
                    this.inputs[i].dataset.value = fields[i];
                }

                if (!this.outputs[i + 1]) {
                    this.el.appendChild(this.createConnector('output', fields[i]));
                    this.outputs[i + 1].dataset.value = fields[i];
                } else {
                    this.outputs[i + 1].setAttribute('title', fields[i]);
                    this.outputs[i + 1].dataset.value = fields[i];
                }

                // index = content.indexOf(fields[i], content.indexOf(' '));
                // indices[fields[i]] = [];

                // let regex = `^\\s*\\(*${fields[i]}\\)*\\s*$`;
                // indices = content.search(new RegExp(regex));
                // console.log(indices);

                // while (index != -1) {
                //     indices[fields[i]].push(index);
                //     index = content.indexOf(fields[i], index + 1);
                // }
            }

            // Suppression des connecteurs
            while (this.inputs.length > fields.length) {
                this.deleteConnector(this.inputs.pop());
                this.deleteConnector(this.outputs.pop());
            }

            let fieldsNodes = e.target.getElementsByClassName('field');

            for (let i = 1; i < fields.length; i++) {
                // index = indices[fields[i]][0];
                let offsetLeft = fieldsNodes[i - 1].offsetLeft;
                this.setConnectorPos(this.inputs[i], offsetLeft);
                this.setConnectorPos(this.outputs[i + 1], offsetLeft);
                // indices[fields[i]].shift();
            }

            this.value = e.target.textContent;

            Graph.updateScript();
        });
        
        // Create input visual
        let input = this.createConnector('input', 'standard input');

        // Create output visual
        let output = this.createConnector('output', 'standard output');

        // Create output error visual
        let error = this.createConnector('error', 'standard error');
        error.classList.add('output');

        this.el.addEventListener('drag', e => {
            this.updateConnectorsPos();
        });

        this.el.appendChild(div);
        this.el.appendChild(input);
        this.el.appendChild(output);
        this.el.appendChild(error);
        

        return this.el;
    }

    getCaret() {
        let selection = window.getSelection();
        let range = selection.getRangeAt(0);
        return {
            container: range.startContainer,
            range: range.startOffset
        };
    }

    setCaret(index, x) {
        let content = this.el.firstChild;
        let span = content.childNodes[index];
        if (!span) return;
        let text = (span.firstChild) ? span.firstChild : span;
        let selection = window.getSelection();
        let range = document.createRange();

        if (x > text.length) {
            x = text.length;
        }
        
        range.setStart(text, x);
        range.collapse(true);

        // console.log(range);
        
        selection.removeAllRanges();
        selection.addRange(range);
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
                this.outputs.push(connector);
                break;
        }
            
        // SVG Connector
        connector.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        connector.path.classList.add('connection');
        Graph.addConnectorPath(connector.path);
        
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

    deleteConnector(connector) {
        Graph.deletePath(connector);
        // if (connector.classList.contains('input')) {
        //     for (let i = 1; i < this.inputs.length; i++) {
        //         if (connector == this.inputs[i]) {
        //             this.inputs.slice(i, 1);
        //         }
        //     }
        // } else if (connector.classList.contains('output')) {
        //     for (let i = 2; i < this.outputs.length; i++) {
        //         if (connector == this.outputs[i]) {
        //             this.outputs.slice(i, 1);
        //         }
        //     }
        // }
        connector.remove();
    }

    setConnectorPos(connector, x, y) {
        if (x) {
            connector.style.left = x + 'px';
        }
        if (y) {
            connector.style.top = y + 'px';
        }
        this.updateConnectorsPos();
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