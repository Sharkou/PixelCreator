import { Renderer } from '/src/core/renderer.js';
import { System } from '/src/core/system.js';

// Pause activated
// if (pause) {
//     document.getElementById('pause').classList.add('active');
// }

document.getElementById('pause').addEventListener('click', function() {
    const el = document.getElementById('pause');
    const renderer = Renderer.main;
    const pause = !renderer.pause;
    renderer.pause = pause;
    System.dispatchEvent('pause', pause);
    el.classList.toggle('active');
    if (pause) {
        el.title = 'Resume';
    } else {
        el.title = 'Pause';
    }
});