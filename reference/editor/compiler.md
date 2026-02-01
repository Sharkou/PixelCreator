Static class for PixelScript compilation

```js
import { Compiler } from '/editor/graph/compiler.js';
```

---

## Static Properties

### [`types`](###types)

Array of type regex patterns

**Type**

| Name | Type |
|------|------|
| types | `Array<RegExp>` |

**Values:** `i32`, `str`, `bool`, `void`

### [`operators`](###operators)

Array of operator regex patterns

**Type**

| Name | Type |
|------|------|
| operators | `Array<RegExp>` |

**Values:** `+`, `-`, `*`, `/`, `>`, `>=`, `<`, `<=`, `==`, `!=`, `,`, `.`, `=`, `&&`, `||`

### [`brackets`](###brackets)

Array of bracket/punctuation regex patterns

**Type**

| Name | Type |
|------|------|
| brackets | `Array<RegExp>` |

**Values:** `;`, `{`, `}`, `(`, `)`, `[`, `]`

### [`keywords`](###keywords)

Array of keyword regex patterns

**Type**

| Name | Type |
|------|------|
| keywords | `Array<RegExp>` |

**Values:** `let`, `struct`, `enum`, `match`, `null`, `await`, `async`, `class`, `const`, `true`, `false`, `fn`, `import`, `this`, `new`, `static`, `super`, `mod`

### [`structures`](###structures)

Array of control structure regex patterns

**Type**

| Name | Type |
|------|------|
| structures | `Array<RegExp>` |

**Values:** `if`, `else if`, `else`, `while`, `for`, `in`, `return`

### [`functions`](###functions)

Array of native function regex patterns

**Type**

| Name | Type |
|------|------|
| functions | `Array<RegExp>` |

**Values:** `print`

---

## Static Methods

### [`init()`](###init())

Initialize the compiler with language definitions

**Example**

```js
Compiler.init();
```

### [`compile(data)`](###compile())

Compile PixelScript to executable code

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| data | `string` | The PixelScript source code |

**Returns:** `Error|undefined` - Error if compilation failed

**Example**

```js
const result = Compiler.compile('let x = 10;');
```

**Process:**
1. Lexical analysis: `lex(data)`
2. Syntax analysis: `parse(tokens)`
3. Transpilation: `transpile(ast)`
4. Evaluation: `evaluate(code)`

### [`lex(str)`](###lex())

Lexical analyzer - tokenize source code

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| str | `string` | The source code |

**Returns:** `Array<string>` - Array of tokens

**Example**

```js
const tokens = Compiler.lex('let x = 10;');
// ['let', 'x', '=', '10', ';']
```

### [`parse(tokens)`](###parse())

Syntax analyzer - build abstract syntax tree

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| tokens | `Array<string>` | Tokens from lexer |

**Returns:** `Array<Object>` - Abstract syntax tree

**Example**

```js
const ast = Compiler.parse(tokens);
```

---

## Token Types

The parser recognizes the following token types:

| Type | Description |
|------|-------------|
| `keyword` | Language keywords |
| `structure` | Control structures |
| `variable` | Variable names |
| `number` | Numeric literals |
| `operator` | Mathematical/logical operators |
| `bracket` | Punctuation |

---

## AST Node Structure

Each node in the AST has:

```js
{
  value: string,      // Token value
  type: string,       // Token type
  params: Array,      // Parameters (for structures)
  operator: Object    // Operator (for structures)
}
```

---

## Compilation Pipeline

1. **Lexical Analysis**: Split source into tokens
   ```
   "let x = 10;" → ['let', 'x', '=', '10', ';']
   ```

2. **Syntax Analysis**: Build AST from tokens
   ```
   [{value: 'let', type: 'keyword'}, ...]
   ```

3. **Transpilation**: Convert AST to JavaScript
   ```
   AST → "let x = 10;"
   ```

4. **Evaluation**: Execute the generated code

---

## Notes

- This compiler is for the visual scripting language (PixelScript)
- Currently in development - not all features are implemented
- Uses regex-based tokenization
- Supports basic control structures
- The `compile()` method includes error handling
- Logs "Compilation successful!" on success
- Returns error object on failure
