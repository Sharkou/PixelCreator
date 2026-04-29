export class Compiler {

    static types;
    static operators;
    static brackets;
    static keywords;
    static structures;
    static functions;

    /**
     * Init Compiler
     * @constructor
     */
    static init() {
        // Type declarations
        this.types = [
            /i32/,
            /str/,
            /bool/,
            /void/
        ];

        // Operator declarations
        this.operators = [
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

        // Punctuation declarations
        this.brackets = [
            /;/,
            /{/,
            /}/,
            /\(/,
            /\)/,
            /\[/,
            /\]/
        ];

        // Keyword declarations
        this.keywords = [
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

        // Control structure declarations
        this.structures = [
            /if/,
            /else if/,
            /else/,
            /while/,
            /for/,
            /in/,
            /return/
        ];

        // Native function declarations
        this.functions = [
            /print/
        ];
    }

    /**
     * Compile data to binary
     * @param {string} data - The data
     */
    static compile(data) {
        let str = transpile(parse(lex(data)));
        try {
            evaluate(str);
            console.log('Compilation successful!');
        } catch (err) {
            console.error(err);
            return err;
        }
    }

    /**
     * Analyseur lexical (décomposition)
     * @param {string} str - The text content
     */
    static lex(str) {
        return str.split(/( |;|{|}|\(|\)|==|=|,|\.|\+|-|\/|\*|\(|\))/)
                  .map(s => s.trim())
                  .filter(s => s.length > 0);
    }

    /**
     * Analyseur syntaxique
     * @param {array} tokens - The tokens
     */
    static parse(tokens) {
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
            
            // Node declaration
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
            for (let keyword of Compiler.keywords) {
                if (keyword.test(peek())) {
                    return true;
                }
            }
        };
        
        const isStruct = () => {
            for (let structure of Compiler.structures) {            
                if (structure.test(peek())) {
                    return true;
                }
            }
        };
        
        const isBracket = () => {
            for (let bracket of Compiler.brackets) {
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
            for (let operator of Compiler.operators) {
                if (operator.test(peek())) {
                    return true;
                }
            }
        };

        const parseExpr = () => {
            
            // Extract control structure
            if (isStruct()) {
                return parseStruct();
            }
            
            // Extract keyword
            else if (isKey()) {
                return parseKey();
            }
            
            // Extract number
            else if (isNum()) {
                return parseNum();
            }
            
            // Extract variable
            else if (isVar()) {
                return parseVar();
            }
            
            // Extract operator
            else if (isOp()) {
                return parseOp();
            }
            
            // Extract bracket
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
    }

    /**
     * Transpile to JavaScript
     * @param {array} tree - The abstract syntax tree
     */
    static transpile(tree) {

        let str = ''; // translation
        
        // const opMap = { sum: '+', mul: '*', sub: '-', div: '/' };
        
        const transpileStruct = node => {
            
            switch(node.value) {

                case 'if':
                    
                    // Build condition
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
    }
}