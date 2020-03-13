/* View in fullscreen */

let fullscreen = false;

document.getElementById('fullscreen').addEventListener('click', function() {

    if (!fullscreen) {
        if (document.documentElement.requestFullscreen) {            
            document.documentElement.requestFullscreen();
        }
    }

    else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
    
    fullscreen = !fullscreen;
});