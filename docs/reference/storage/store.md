Initialize a new `Store`

```js
import { Store } from '/src/storage/store.js';

const store = new Store({
    name: 'myDatabase',
    version: 1
});

await store.open();
```

---

## Parameters

| Name   | Type   | Description |
|--------|--------|-------------|
| name | `string` | The database name (default: 'default') |
| version | `number` | The database version (default: 1) |

---

## Properties

### [`name`](###name)

Get the database name

**Parameters**

| Name | Type |
|------|------|
| name | `string` |

**Example**

```js
const dbName = store.name;
```

### [`version`](###version)

Get the database version

**Parameters**

| Name | Type |
|------|------|
| version | `number` |

**Example**

```js
const dbVersion = store.version;
```

### [`db`](###db)

The IndexedDB database instance

**Parameters**

| Name | Type |
|------|------|
| db | `IDBDatabase` |

**Example**

```js
const database = store.db;
```

---

## Methods

### [`open()`](###open())

Open the database connection

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<IDBDatabase>` | Promise that resolves when the database is opened |

**Example**

```js
const store = new Store({ name: 'gameData', version: 1 });
await store.open();
```

### [`delete()`](###delete())

Delete the entire database

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<void>` | Promise that resolves when the database is deleted |

**Example**

```js
await store.delete();
```

### [`upgrade()`](###upgrade())

Upgrade the database structure (called automatically on version change)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| oldVersion | `number` | The old database version |

**Example**

```js
// Override this method to customize upgrade behavior
store.upgrade = function(oldVersion) {
    switch (oldVersion) {
        case 0:
            this.db.createObjectStore('players', { keyPath: 'id' });
            break;
        case 1:
            this.db.createObjectStore('levels', { keyPath: 'id' });
            break;
    }
};
```

### [`add()`](###add())

Add new data to the object store

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<*>` | Promise that resolves with the key of the added data |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| objectStoreName | `string` | The name of the object store |
| data | `Object` | The data to add (must include the keyPath property) |

**Example**

```js
await store.add('data', { id: 1, name: 'Player One', score: 100 });
```

### [`put()`](###put())

Update or add data to the object store

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<*>` | Promise that resolves with the key of the data |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| objectStoreName | `string` | The name of the object store |
| data | `Object` | The data to update or add |

**Example**

```js
// Add or update the player data
await store.put('data', { id: 1, name: 'Player One', score: 150 });
```

### [`get()`](###get())

Get data from the object store by key

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<Object>` | Promise that resolves with the data |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| objectStoreName | `string` | The name of the object store |
| key | `*` | The key of the data to retrieve |

**Example**

```js
const player = await store.get('data', 1);
console.log(player.name); // 'Player One'
```

### [`getAll()`](###getAll())

Get all data from the object store

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<Array>` | Promise that resolves with an array of all data |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| objectStoreName | `string` | The name of the object store |

**Example**

```js
const allPlayers = await store.getAll('data');
console.log(allPlayers.length); // Number of players
```

### [`remove()`](###remove())

Remove data from the object store by key

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<void>` | Promise that resolves when the data is removed |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| objectStoreName | `string` | The name of the object store |
| key | `*` | The key of the data to remove |

**Example**

```js
await store.remove('data', 1);
```

### [`clear()`](###clear())

Clear all data from the object store

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<void>` | Promise that resolves when the store is cleared |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| objectStoreName | `string` | The name of the object store |

**Example**

```js
await store.clear('data');
```

### [`count()`](###count())

Count the number of items in the object store

**Return**

| Name | Type | Description |
|------|------|--------|
| promise | `Promise<number>` | Promise that resolves with the count |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| objectStoreName | `string` | The name of the object store |

**Example**

```js
const playerCount = await store.count('data');
console.log(`Total players: ${playerCount}`);
```

### [`close()`](###close())

Close the database connection

| Return |
|--------|
| `void` |

**Example**

```js
store.close();
```

---

## Complete Example

```js
import { Store } from '/src/storage/store.js';

// Create and open the database
const store = new Store({
    name: 'gameDatabase',
    version: 1
});

await store.open();

// Add player data
await store.add('data', {
    id: 1,
    name: 'Alice',
    level: 5,
    score: 1000
});

await store.add('data', {
    id: 2,
    name: 'Bob',
    level: 3,
    score: 750
});

// Update player data
await store.put('data', {
    id: 1,
    name: 'Alice',
    level: 6,
    score: 1500
});

// Get a specific player
const player = await store.get('data', 1);
console.log(player.name); // 'Alice'
console.log(player.score); // 1500

// Get all players
const allPlayers = await store.getAll('data');
console.log(`Total players: ${allPlayers.length}`);

// Count players
const count = await store.count('data');
console.log(`Player count: ${count}`);

// Remove a player
await store.remove('data', 2);

// Clear all data
await store.clear('data');

// Close the database
store.close();
```

---

## Saving Game State

```js
import { Store } from '/src/storage/store.js';
import { System } from '/src/core/system.js';

class SaveManager {
    constructor() {
        this.store = new Store({
            name: 'gameData',
            version: 1
        });
    }

    async init() {
        await this.store.open();
    }

    async saveGame(slot = 1) {
        const gameState = {
            id: slot,
            timestamp: Date.now(),
            scene: System.scene.name,
            objects: System.scene.objects.map(obj => obj.serialize())
        };

        await this.store.put('data', gameState);
        console.log('Game saved to slot', slot);
    }

    async loadGame(slot = 1) {
        const gameState = await this.store.get('data', slot);
        
        if (gameState) {
            // Restore the scene and objects
            System.scene.clear();
            gameState.objects.forEach(objData => {
                System.scene.add(Object.deserialize(objData));
            });
            console.log('Game loaded from slot', slot);
        } else {
            console.log('No save found in slot', slot);
        }
    }

    async getSaveSlots() {
        const saves = await this.store.getAll('data');
        return saves.map(save => ({
            slot: save.id,
            date: new Date(save.timestamp),
            scene: save.scene
        }));
    }

    async deleteSave(slot = 1) {
        await this.store.remove('data', slot);
        console.log('Save deleted from slot', slot);
    }
}

// Usage
const saveManager = new SaveManager();
await saveManager.init();

// Save the game
await saveManager.saveGame(1);

// Load the game
await saveManager.loadGame(1);

// Get all save slots
const slots = await saveManager.getSaveSlots();
console.log(slots);
```
