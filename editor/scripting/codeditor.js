function colorer(text, _class) {
    return '<span class="' + _class + '">' + text + '</span>';
}

function tabulation(e) {
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

function getCaretPosition(element) {
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

function setCaretPosition(element, offset) {
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

function countLines(code) {
    var lines = code.childNodes;
    for (var i = 0; i < lines.length; i++) {
        lines[i].setAttribute('data-line', i + 1);
    }
}

function getSelectedNode() {
    
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

function getCurrentLine(node = null) {
    
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

function highlight(code) {
    
    var lines = code.childNodes;
    
    for (var i = 0; i < lines.length; i++) {
        lines[i].classList.remove('highlight');
    }
    
    getSelectedNode().classList.add('highlight');
}

function syntaxHighlights(code) {
    
    let lines = code.childNodes;
    let node = getCurrentLine(); // save element selected
    let caretPos = getCaretPosition(node); // save caret position
    
    for (let i = 0; i < lines.length; i++) {
        
        let line = lines[i].textContent;
        
        for (let attr in obj) {
            line = line.replace(new RegExp(obj[attr].re, 'gi'), e => {
                return colorer(e, obj[attr].class);
            });
        }
        
        // console.log('line ' + i + ': ' + line);
        
        lines[i].innerHTML = line;
    }
    
    setCaretPosition(node, caretPos); // restore caret position
}

var obj = {
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

window.addEventListener('load', function () {

    var editor = document.getElementById('editor');

    editor.addEventListener('click', function (e) {
        highlight(editor);
        syntaxHighlights(editor);
    });

    editor.addEventListener('keydown', function (e) {
        tabulation(e);
    });

    editor.addEventListener('input', function (e) {
        countLines(editor);
        highlight(editor);
        // syntaxHighlights(editor);
    });
});