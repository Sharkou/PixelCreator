// KeyEvent
var key = new KeyboardEvent('');
var waitForKey = false;
var inProgress = false;

// Create new event
var currentEvent = new Event();

// Events Listeners
$('mouseEvent').onclick = addEvent;
$('keyboardEvent').onclick = addEvent;
$('collisionEvent').onclick = addEvent;

// Actions Listeners
$('moveAction').onclick = addAction;
$('editVariableAction').onclick = addAction;
$('createObjectAction').onclick = addAction;
$('deleteAction').onclick = addAction;
$('drawAction').onclick = addAction;

// On écoute l'event KeyPressed
document.onkeydown = function (e) {
    if (waitForKey) {
        key = e || window.event;
        document.getElementById('key').innerHTML = ((key.key == ' ') ? 'Space' : key.key); // affichage dans le blueprint
        currentEvent.key = document.getElementById('key').innerHTML;
        waitForKey = false;
        console.log(currentEvent.key);
    }
};

function addEvent() {
    currentEvent.addEvent(this.id);
    
    // UI Display
    if (!inProgress) {
        switch (currentEvent.event) {
            case 'mouseEvent':
                break;

            case 'keyboardEvent':
                $('blueprint').appendChild(htmlToElement(keyPressedBox));

                // Détection de la touche pressée
                $('keyButton').onmousedown = (e) => {
                    if (e.button === 0) { // Left button
                        waitForKey = true;
                    }
                };
                break;

            case 'collisionEvent':
                break;
        }
        inProgress = true;
    }
}

function addAction() {
    // currentEvent.addAction(this.id);
    
    // UI Display
    switch (this.id) {
        case 'moveAction':
            $('blueprint').appendChild(htmlToElement(moveActionBox));
            break;
            
        case 'editVariableAction':
            break;
            
        case 'createObjectAction':
            break;
            
        case 'deleteAction':
            break;
            
        case 'drawAction':
            break;
    }
}

function applyEvents() {
    
    var name = '';
    
    var move = {
        x: 0,
        y: 0
    };
    
    // Analyse des events
    currentEvent.name = $('eventName').value;
    currentEvent.interface = $('blueprint').innerHTML;
    
    move.x = (document.querySelector('.moveX').value ? 
              document.querySelector('.moveX').value : 0);
    move.y = (document.querySelector('.moveY').value ? 
              document.querySelector('.moveY').value : 0);
    
    // Add actions to event
    currentEvent.addActions({
        move: move
    });
    
    // New event    
    if (typeof resources[currentEvent.id] === 'undefined') {
        
        // Add event to resources
        resources[currentEvent.id] = currentEvent;
        addResource(currentEvent.id, 'settings', currentEvent.name);
        
        if (current) {
            current.addEvent(currentEvent);
        
            // Add event to properties
            currentEvent.addToProperties();
        }
    }
    // Event already existing
    else {
        resources[currentEvent.id] = currentEvent;
        
        if (current) {
            updateProperty(currentEvent.id, currentEvent.name);
        }
    }
}