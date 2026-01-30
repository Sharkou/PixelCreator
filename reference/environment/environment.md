The **Environment** class provides runtime detection, platform identification, and capability checking for cross-platform compatibility.

```javascript
import { Environment } from '/src/runtime/environment.js';
```

---

## Runtime Detection

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isBrowser` | boolean | Running in web browser |
| `isDeno` | boolean | Running in Deno |
| `isNode` | boolean | Running in Node.js |
| `isServer` | boolean | Running on server (Deno/Node) |
| `isClient` | boolean | Running on client (browser) |

```javascript
if (Environment.isBrowser) {
    // Browser-specific code
}

if (Environment.isServer) {
    // Server-side logic
}
```

---

## Device Detection

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isMobile` | boolean | Mobile device |
| `isDesktop` | boolean | Desktop device |
| `hasTouch` | boolean | Touch support |

```javascript
if (Environment.isMobile) {
    showTouchControls();
} else {
    showKeyboardHints();
}
```

---

## Capability Detection

### Graphics

| Property | Description |
|----------|-------------|
| `hasWebGL` | WebGL 1.0 support |
| `hasWebGL2` | WebGL 2.0 support |
| `hasWebGPU` | WebGPU support |

### Audio & Network

| Property | Description |
|----------|-------------|
| `hasWebAudio` | Web Audio API |
| `hasWebSocket` | WebSocket support |

### Storage

| Property | Description |
|----------|-------------|
| `hasLocalStorage` | localStorage available |
| `hasIndexedDB` | IndexedDB available |

### Input & Display

| Property | Description |
|----------|-------------|
| `hasGamepad` | Gamepad API support |
| `hasFullscreen` | Fullscreen API |
| `hasPointerLock` | Pointer Lock API |

```javascript
if (Environment.hasWebGL2) {
    initWebGL2Renderer();
} else if (Environment.hasWebGL) {
    initWebGLRenderer();
} else {
    initCanvas2DRenderer();
}
```

---

## Screen & Window

| Property | Type | Description |
|----------|------|-------------|
| `pixelRatio` | number | Device pixel ratio |
| `screenWidth` | number | Screen width |
| `screenHeight` | number | Screen height |
| `windowWidth` | number | Window width |
| `windowHeight` | number | Window height |

```javascript
canvas.width = Environment.windowWidth * Environment.pixelRatio;
canvas.height = Environment.windowHeight * Environment.pixelRatio;
```

---

## State Properties

| Property | Type | Description |
|----------|------|-------------|
| `isVisible` | boolean | Page is visible |
| `hasFocus` | boolean | Window has focus |
| `isOnline` | boolean | Network connected |
| `language` | string | Browser language |
| `userAgent` | string | User agent string |

```javascript
if (!Environment.isVisible) {
    pauseGame();
}

if (!Environment.isOnline) {
    showOfflineMode();
}
```

---

## Methods

### `getPlatform()`
Get platform identifier.
```javascript
const platform = Environment.getPlatform();
// 'windows', 'macos', 'linux', 'android', 'ios', 'deno', 'node'
```

### `getBrowser()`
Get browser name.
```javascript
const browser = Environment.getBrowser();
// 'chrome', 'firefox', 'safari', 'edge', 'opera'
```

### `getDeviceInfo()`
Get comprehensive device information.
```javascript
const info = Environment.getDeviceInfo();
// {
//   platform: 'windows',
//   browser: 'chrome',
//   isMobile: false,
//   isDesktop: true,
//   hasTouch: false,
//   pixelRatio: 1,
//   screenWidth: 1920,
//   screenHeight: 1080,
//   windowWidth: 1280,
//   windowHeight: 720,
//   language: 'en-US',
//   isOnline: true
// }
```

### `getCapabilities()`
Get all capability flags.
```javascript
const caps = Environment.getCapabilities();
// {
//   webgl: true,
//   webgl2: true,
//   webgpu: false,
//   webaudio: true,
//   websocket: true,
//   localstorage: true,
//   indexeddb: true,
//   fullscreen: true,
//   pointerlock: true,
//   gamepad: true,
//   touch: false
// }
```

### `debug()`
Log environment info to console.
```javascript
Environment.debug();
```

---

## Common Patterns

### Adaptive Controls
```javascript
function setupControls() {
    if (Environment.hasTouch) {
        enableTouchControls();
    }
    if (Environment.hasGamepad) {
        enableGamepadSupport();
    }
}
```

### Renderer Selection
```javascript
function createRenderer() {
    if (Environment.hasWebGPU) {
        return new WebGPURenderer();
    } else if (Environment.hasWebGL2) {
        return new WebGL2Renderer();
    }
    return new Canvas2DRenderer();
}
```

### Visibility Handling
```javascript
document.addEventListener('visibilitychange', () => {
    if (Environment.isVisible) {
        resumeGame();
    } else {
        pauseGame();
    }
});
```

### Cross-Platform Code
```javascript
function saveData(data) {
    if (Environment.isServer) {
        Deno.writeTextFile('save.json', JSON.stringify(data));
    } else if (Environment.hasLocalStorage) {
        localStorage.setItem('save', JSON.stringify(data));
    }
}
```

---

## Notes

- All properties are computed on access (not cached)
- Browser-specific properties return safe defaults on server
- Use `init()` for early capability detection if needed

---

## See Also

- [System](system.md) – Core engine system
- [Performance](performance.md) – Performance monitoring
