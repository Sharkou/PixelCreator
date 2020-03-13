import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';

document.getElementById('playButton').addEventListener('click', function() {
    var width = Camera.main.width;
    var height = Camera.main.height;
    
    var app = window.open('/bin/index.html', '_blank', 'directories=no,fullscreen=yes,titlebar=no,toolbar=no,location=no,status=yes,menubar=no,scrollbars=no,resizable=yes,top=' + height / 2.5 + ',left=' + width / 2 + ',width=' + width + ',height=' + height);
    
    app.objects = Scene.main.objects;
});