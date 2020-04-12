import { Scene } from '/src/core/scene.js';

/** 
 * Module permettant de gérer les raccourcis clavier.
 */
document.addEventListener('keydown', (e) => {
    if (document.activeElement === document.body) {
        switch (e.key) {
            // Delete current object on suppr key pressed.
            case 'Delete':
                Scene.main.remove(Scene.main.current);
                Scene.main.current = null;
                break;
        }
    }
});