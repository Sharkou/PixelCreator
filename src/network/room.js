// import { System } from '/src/core/system.js';
import { db } from '/src/db/firebase.js';

export class Room {
    
    /**
     * Initialize the room
     * @constructor
     * @param {Socket} socket - The client socket
     */
    constructor(socket) {
        
        this.socket = socket;
        this.name = '';
        this.host = null;
        // this.players = {};
    }

    /**
     * Create the room
     * @constructor
     * @param {string} name - The room name
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
    
    sync(name) {
        
        db.collection('rooms').doc(name).onSnapshot((doc) => {
            
            let room = doc.data(); // get room data
            
            if (room.player) {
                this.socket.connect(room.player.id, true); // connect to client
            }
        });
    }
}