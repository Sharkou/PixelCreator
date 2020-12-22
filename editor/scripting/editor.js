import { System } from '/src/core/system.js';
import { Project } from '/editor/windows/project.js';
import { Loader } from '/src/core/loader.js';

export class Editor {

    static el = document.getElementById('editor');
    static launched = false;
    static current = null; // current script
    static value = ''; // current script value

    static init() {
        this.launched = true;
        const project = Project.main;
        document.getElementById('script-btn').click();

        /* Monaco Editor */
        require.config({ paths: { 'vs': 'https://unpkg.com/monaco-editor@latest/min/vs' }});
        window.MonacoEnvironment = { getWorkerUrl: () => proxy };

        let proxy = URL.createObjectURL(new Blob([`
            self.MonacoEnvironment = {
                baseUrl: 'https://unpkg.com/monaco-editor@latest/min/'
            };
            importScripts('https://unpkg.com/monaco-editor@latest/min/vs/base/worker/workerMain.js');
        `], { type: 'text/javascript' }));

        require(["vs/editor/editor.main"], () => {

            monaco.editor.defineTheme('my-theme', {
                base: 'vs-dark',
                inherit: true,
                rules: [{
                    background: '#232323'
                }],
                colors: {
                    'editor.background': '#272727',
                    'minimap.background': '#272727'
                }
            });

            monaco.editor.setTheme('my-theme');

            this.editor = monaco.editor.create(this.el, {
                value: [
                    ''
                ].join('\n'),
                language: 'javascript',
                wordWrap: 'on',
                automaticLayout: true
                // theme: 'vs-dark'
            });

            document.getElementById('project-btn').click();

            this.editor.onDidChangeModelContent(async e => {
                if (project.current && project.current == this.current) {
                    const value = this.getValue();
                    if (value !== this.value && !e.isFlush) { // user input
                        this.current.$value = this.value = value;
                        // console.log(this.value);
                        try {
                            const name = value.match(/class ([a-zA-Z0-9$_]+) {/)[1];
                            if (name !== this.current.name.replace(/\s/g, '')) {
                                // On change le nom de la ressource par le nom de la classe
                                this.current.$name = name;

                                // Refresh component in properties
                                // Scene.main.refresh();
                            }
                        } catch(err) {
                            // SyntaxError: do nothing
                        }
                    }
                }
            });
        });

        // Update script in editor on change
        System.addEventListener('setProperty', data => {
            const obj = data.object;
            const prop = data.prop;
            const value = data.value;
            if (this.current && this.current == obj) {
                if (prop === 'value' && value !== this.value) {
                    // const pos = this.editor.getPosition();
                    // console.log(value);
                    this.setValue(value);
                    // this.editor.setPosition(pos);
                    this.value = value;
                } else if (prop === 'name' && value !== this.value) {
                    // Set class name
                    this.setValue(this.getValue().replace(/(class )([a-zA-Z0-9$_]+)( {)/, '$1' + value.replace(/\s/g, '') + '$3'));
                    this.value = value;
                }
            }
        });
    }

    static resize() {
        if (this.editor) {
            this.editor.layout();
        }
    }

    static getValue() {
        return this.editor.getValue();
    }

    static setValue(text) {
        this.editor?.setValue(text); // .getModel()
    }

    static color(text, _class) {
        return '<span class="' + _class + '">' + text + '</span>';
    }

    static tabulation(e) {
        if (e.keyCode === 9) { // tab key
            e.preventDefault(); // this will prevent us from tabbing out of the editor
    
            // now insert four non-breaking spaces for the tab key
            var editor = document.getElementById('editor');
            var doc = editor.ownerDocument.defaultView;
            var sel = doc.getSelection();
            var range = sel.getRangeAt(0);
    
            var tabNode = document.createTextNode('\u00a0\u00a0\u00a0\u00a0');
            range.insertNode(tabNode);
    
            range.setStartAfter(tabNode);
            range.setEndAfter(tabNode);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    static getCaretPosition(element) {
        var caretPos = 0,
            sel, range;
        if (window.getSelection) {
            sel = window.getSelection();
            if (sel.rangeCount) {
                range = sel.getRangeAt(0);
                if (range.commonAncestorContainer.parentNode == element) {
                    caretPos = range.endOffset;
                }
            }
        } else if (document.selection && document.selection.createRange) {
            range = document.selection.createRange();
            if (range.parentElement() == element) {
                var tempEl = document.createElement("span");
                element.insertBefore(tempEl, element.firstChild);
                var tempRange = range.duplicate();
                tempRange.moveToElementText(tempEl);
                tempRange.setEndPoint("EndToEnd", range);
                caretPos = tempRange.text.length;
            }
        }
        return caretPos;
    }

    static setCaretPosition(element, offset) {
        var range = document.createRange();
        var selection = window.getSelection();
    
        // Select appropriate node
        var currentNode = null;
        var previousNode = null;
    
        for (var i = 0; i < element.childNodes.length; i++) {
            
            previousNode = currentNode; //save previous node        
            currentNode = element.childNodes[i]; // get current node
            
            // If we get span or something else then we should get child node
            while (currentNode.childNodes.length > 0){
              currentNode = currentNode.childNodes[0];
            }
    
            // Calc offset in current node
            if (previousNode != null) {
                offset -= previousNode.length;
            }
            
            // Check whether current node has enough length
            if (offset <= currentNode.length) {
                break;
            }
        }
        
        // Move caret to specified offset
        if (currentNode != null) {
            range.setStart(currentNode, offset);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    static countLines(code) {
        var lines = code.childNodes;
        for (var i = 0; i < lines.length; i++) {
            lines[i].setAttribute('data-line', i + 1);
        }
    }

    static getSelectedNode() {
    
        /*if (document.selection)
            return document.selection.createRange().parentElement();
        
        else {*/
    
        var selection = window.getSelection();
        
        if (selection.rangeCount > 0) {
            
            var node = selection.getRangeAt(0).startContainer;
            
            if (node.textContent) {
                return selection.getRangeAt(0).startContainer.parentNode;
            }
            else {
                return selection.getRangeAt(0).startContainer;
            }
        }
    }

    static getCurrentLine(node = null) {
    
        if (!node) {
            node = document.getSelection().anchorNode;
        }
        
        if (node.nodeType === 1) {            
            if (node.classList.contains('line')) {               
                return node;
            }
        }

        return getCurrentLine(node.parentElement);
    }

    static highlight(code) {
    
        var lines = code.childNodes;
        
        for (var i = 0; i < lines.length; i++) {
            lines[i].classList?.remove('highlight');
        }
        
        getSelectedNode().classList?.add('highlight');
    }

    static syntaxHighlights(code) {
    
        let obj = {
            string: {
                re: '".+"',
                class: 'string'
            },
            number: {
                re: '\d+',
                class: 'number'
            },
            equal: {
                re: '=',
                class: 'equal'
            },
            const: {
                re: 'const',
                class: 'keyword'
            },
            var: {
                re: 'var',
                class: 'keyword'
            },
            let: {
                re: 'let',
                class: 'keyword'
            },
            new: {
                re: 'new',
                class: 'keyword'
            },
            function: {
                re: 'function',
                class: 'keyword'
            },
            for: {
                re: 'for',
                class: 'keyword'
            },
            while: {
                re: 'while',
                class: 'keyword'
            },
            property: {
                re: ' [a-zA-Z]+ ',
                class: 'property'
            },
        };
        let lines = code.childNodes;
        let node = getCurrentLine(); // save element selected
        let caretPos = getCaretPosition(node); // save caret position
        
        for (let i = 0; i < lines.length; i++) {
            
            let line = lines[i].textContent;
            
            for (let attr in obj) {
                line = line.replace(new RegExp(obj[attr].re, 'gi'), e => {
                    return color(e, obj[attr].class);
                });
            }
            
            // console.log('line ' + i + ': ' + line);
            
            lines[i].innerHTML = line;
        }
        
        setCaretPosition(node, caretPos); // restore caret position
    }

    static preventDeleting(e) {
        if (e.key === 'Backspace') { // || e.key === 'Delete' || e.key === 'Paste') {
            const selection = window.getSelection();
            // Don't allow deleting nodes
            if (!selection.anchorNode.isSameNode(selection.focusNode)) {
                e.preventDefault();
            }        
            if (!selection.anchorNode.textContent) {
                if (selection.anchorNode.dataset.line == '1') {
                    e.preventDefault();
                }
            }
        }
    }

    static getCode(editor) {
        let code = '';
        let lines = editor.childNodes;
        lines.forEach(function(line){
            code = code + line.textContent + '\n';
        });
        return code;
    }
}

window.addEventListener('load', function () {

    return;

    const editor = document.getElementById('editor');

    // init(editor);

    editor.addEventListener('click', function (e) {
        highlight(editor);
        // syntaxHighlights(editor);
        // getCode(editor);
    });

    editor.addEventListener('keydown', function (e) {
        preventDeleting(e);
        tabulation(e);
    });

    editor.addEventListener('input', function (e) {
        countLines(editor);
        highlight(editor);
        // syntaxHighlights(editor);
    });

    editor.addEventListener('paste', e => {
        // Get user's pasted data
        // let data = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
        let data = e.clipboardData.getData('text/plain');
        
        // Filter out everything except simple text and allowable HTML elements
        // let regex = /<(?!(\/\s*)?(a|b|i|em|s|strong|u)[>,\s])([^>])*>/g;
        // data = data.replace(regex, '');
        
        // Insert the filtered content
        // document.execCommand('insertHTML', false, data);
        document.execCommand('insertText', false, data);
      
        // Prevent the standard paste behavior
        e.preventDefault();
    });

    editor.addEventListener('drop', e => {
        e.preventDefault();
        let data = e.dataTransfer.getData('text/plain');        
        document.execCommand('insertText', false, data);
    });
});