const fs = require('fs');
const child_process = require('child_process');

// Parameters
const [,, src] = process.argv;
const dest = src.split('.').slice(0, -1).join('.') + '.rs';

fs.readFile(src, 'utf8', function(err, data) {
    if (err) throw err;
    
    let str = transpile(parse(lex(data)));
    
    fs.writeFile(dest, str, function(err) {
        if (err) throw err;
    });
    
    // compile();
});

// Déclaration des types
const types = [
    /i32/,
    /str/,
    /bool/,
    /void/
];

// Déclarations des opérateurs
const operators = [
    /\+/,
    /-/,
    /\*/,
    /\//,
    />/,
    />=/,
    /</,
    /<=/,
    /==/,
    /!=/,
    /,/,
    /\./,
    /=/,
    /&&/,
    /||/
];

// Déclarations des signes de ponctuation
const brackets = [
    /;/,
    /{/,
    /}/,
    /\(/,
    /\)/,
    /\[/,
    /\]/
];

// Déclaration des mots clés
const keywords = [
    /let/,
    /struct/,
    /enum/,
    /match/,
    /null/,
    /await/,
    /async/,
    /class/,
    /const/,
    /true/,
    /false/,
    /fn/,
    /import/,
    /this/,
    /new/,
    /static/,
    /super/,
    /mod/
];

// Déclaration des structures de contrôle
const structures = [
    /if/,
    /else if/,
    /else/,
    /while/,
    /for/,
    /in/,
    /return/
];

// Déclaration des fonctions natives
const functions = [
    /print/
];

// Analyseur lexical (décomposition)
const lex = str => str.split(/( |;|{|}|\(|\)|==|=|,|\.|\+|-|\/|\*|\(|\))/).map(s => s.trim()).filter(s => s.length > 0);

// Analyseur syntaxique
const parse = tokens => {

    let tree = []; // arbre d'analyse syntaxique
    let i = 0;
    
    const peek = () => tokens[i];
    const consume = () => tokens[i++];
    
    const parseKey = () => {
        return {
            value: consume(),
            type: 'keyword'
        };
    };
    
    const parseStructKey = () => {
        return {
            value: consume(),
            type: 'structure'
        };
    };
    
    const parseStruct = () => {
        
        // Déclaration du noeud
        let node = parseStructKey();

        switch (node.value) {

            case 'if':
            case 'else if':
                
                node.params = [];

                while(!isBracket()) {
                    
                    if (isVar()) {
                        node.params.push(parseVar());
                    }
                    
                    else if (isOp()) {
                        node.operator = parseOp();
                    }
                }                
                
                break;
        }
        
        return node;
    };
    
    const parseNum = () => {
        return {
            value: parseInt(consume()),
            type: 'number'
        };
    };
    
    const parseVar = () => {
        return {
            value: consume(),
            type: 'variable'
        };
    };
    
    const parseOp = () => {
        return {
            value: consume(),
            type: 'operator'
        };
    };
    
    const parseBracket = () => {
        return {
            value: consume(),
            type: 'bracket'
        };
    };
    
    const isKey = () => {
        for (let keyword of keywords) {
            if (keyword.test(peek())) {
                return true;
            }
        }
    };
    
    const isStruct = () => {
        for (let structure of structures) {            
            if (structure.test(peek())) {
                return true;
            }
        }
    };
    
    const isBracket = () => {
        for (let bracket of brackets) {
            if (bracket.test(peek())) {
                return true;
            }
        }
    };
    
   const isNum = () => {
        if (/\d/.test(peek())) {
            return true;
        }
    };
    
    const isVar = () => {
        if (/\w+/.test(peek())) {
            return true;
        }
    };
    
    const isOp = () => {
        for (let operator of operators) {
            if (operator.test(peek())) {
                return true;
            }
        }
    };

    const parseExpr = () => {
        
        // Extraction d'une structure de contrôle
        if (isStruct()) {
            return parseStruct();
        }
        
        // Extraction d'un mot clé
        else if (isKey()) {
            return parseKey();
        }
        
        // Extraction d'un nombre
        else if (isNum()) {
            return parseNum();
        }
        
        // Extraction d'une variable
        else if (isVar()) {
            return parseVar();
        }
        
        // Extraction d'un opérateur
        else if (isOp()) {
            return parseOp();
        }
        
        // Extraction d'un bracket
        else if (isBracket()) {
            return parseBracket();
        }

        // Syntax error
        else {
            return null;
        }

    };
    
    while (peek()) {
        tree.push(parseExpr());
    }

    return tree;    
};

// Transpiler to Rust
const transpile = tree => {
    
    let str = ''; // translation
    
    // const opMap = { sum: '+', mul: '*', sub: '-', div: '/' };
    
    const transpileStruct = node => {
        
        switch(node.value) {

            case 'if':
                
                // Création de la condition
                return transpileKey(node)
                       .concat(transpileVar(node.params[0]))
                       .concat(transpileOp(node.operator))
                       .concat(transpileVar(node.params[1]));
                break;

            default:
                return node.value + ' ';
        }
    };
    
    const transpileKey = node => {
        return node.value + ' ';
    };
    
    const transpileNum = node => {
        return node.value + ' ';
    };
    
    const transpileVar = node => {
        return node.value + ' ';
    };
    
    const transpileOp = node => {
        return node.value + ' ';
    };
    
    const transpileBracket = node => {
        return node.value + ' ';
    };
    
    // Transpile le noeud
    const transpileNode = node => {
        
        switch (node.type) {
                
            case 'structure':
                return transpileStruct(node);
                break;
                
            case 'keyword':
                return transpileKey(node);
                break;
                
            case 'number':
                return transpileNum(node);
                break;
                
            case 'variable':
                 return transpileVar(node);
                break;
                
            case 'operator':
                 return transpileOp(node);
                break;
                
            case 'bracket':
                 return transpileBracket(node);
                break;
        }
        
    };
    
    for (let node of tree) {
        
        // not undefined or null
        if (node) {
            str += (transpileNode(node));
        }
        
    }
    
    return str.slice(0, -1);
};

// Compiler Rust to binary
const compile = () => {
    child_process.exec('rustc ' + dest, (err, stdout, stderr) => {
        if (err) throw err;
        console.log('Compilation successful!');
    });
};