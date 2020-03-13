// Click on Event Button
$('event').onclick = function() {
    
    // Clear Blueprint
    clearBox('blueprint');
    
    // Add Event Name Box
    $('blueprint').appendChild(htmlToElement(eventName));
    
    //$("overlay").style.width = '100%';
    //$("overlay").style.opacity = '1';
    $("overlay").style.display = 'block';
    //$("wrapper").style.width = '0%';
    //$("wrapper").style.opacity = '0';
    $("wrapper").style.display = 'none';
    
    // Create new event
    currentEvent = new Event();
};

// Close Events Window
function closeNav() {
    //$("overlay").style.width = '0%';
    //$("overlay").style.opacity = '0';
    //$("wrapper").style.width = '100%';
    //$("wrapper").style.opacity = '1';
    $("overlay").style.display = 'none';
    $("wrapper").style.display = 'block';
    
    // Add events to current object
    applyEvents();
    
    // Ajout de l'event dans les options du select
    /*var eventsList = $('eventsList');
    var option = document.createElement("option");
    option.text = currentEvent;
    eventsList.add(option);*/
}

// Edition de l'évènement
function editEvent(id) {
    
    // Clear Blueprint
    clearBox('blueprint');
    
    $("overlay").style.display = 'block';
    $("wrapper").style.display = 'none';
    
    // Add Event Boxes
    $('blueprint').innerHTML = resources[id].interface;
    
    // Changement de touche
    if ($('keyButton')) {
        $('keyButton').onmousedown = function(e) {
            if (e.button === 0) { // Left button
                waitForKey = true;
            }
        };
    }
}