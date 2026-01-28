// import { System } from '/src/core/system.js';
import { db } from '/src/db/firebase.js';

/**
 * Multiplayer room management
 * Handles room creation, joining, and real-time synchronization via Firebase
 */
export class Room {
    
    /**
     * Create a new room instance
     * @param {Socket} socket - The client P2P socket
     */
    constructor(socket) {
        /** @type {Socket} The client socket */
        this.socket = socket;
        
        /** @type {string} Room name */
        this.name = '';
        
        /** @type {{name: string, id: string}|null} Host information */
        this.host = null;
        // this.players = {};
    }

    /**
     * Create a new room as host
     * @param {string} name - The room name
     * @returns {Promise<void>} Resolves when room is created
     */
    create(name) {
        
        return new Promise((resolve, reject) => {
            
            this.host = {
                name: this.socket.name,
                id: this.socket.id
            }
            
            db.collection('rooms').doc(name).set({
                host: this.host
            })
            .then(() => {
                this.sync(name); // sync data
                resolve();
            })
            .catch(error => {
                console.error("Error adding document: ", error);
            });            
        });
    }
    
    /**
     * Join an existing room
     * @param {string} name - The room name to join
     * @returns {Promise<void>} Resolves when joined
     */
    join(name) {
        
        return new Promise((resolve, reject) => {
            
            db.collection('rooms').doc(name).get().then(async doc => {
                
                let room = doc.data(); // get room data
                await this.socket.connect(room.host.id); // wait for connect to host
                
                db.collection('rooms').doc(name).set({
                    
                    player: {
                        name: this.socket.name,
                        id: this.socket.id
                    }
                    
                }, { merge: true }) // merge the new data with existing document 
                
                .then(function() {
                    resolve();
                })
                .catch(error => {
                    console.error("Error adding document: ", error);
                });
                
            }).catch(function(error) {
                console.error("Error getting document:", error);
            });
        });
    }
    
    /**
     * Synchronize room state with Firebase
     * @param {string} name - The room name
     */
    sync(name) {
        
        db.collection('rooms').doc(name).onSnapshot((doc) => {
            
            let room = doc.data(); // get room data
            
            if (room.player) {
                this.socket.connect(room.player.id, true); // connect to client
            }
        });
    }
}