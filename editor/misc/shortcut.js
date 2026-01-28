import { Scene } from '/src/core/scene.js';
import { Loader } from '/src/core/loader.js';
import { Project } from '/editor/windows/project.js';

document.addEventListener('keydown', (e) => {
    if (document.activeElement === document.body) {
        switch (e.key) {
            // Delete current object on suppr key pressed.
            case 'Delete':
                const scene = Scene.main;
                const project = Project.main;
                if (scene.current instanceof File) {
                    // project.remove(project.current);
                    Loader.delete(project.current);
                    project.current = null;
                    scene.current = null;
                } else if (scene.current instanceof Object) {
                    scene.remove(scene.current);
                    scene.current = null;
                }
                break;
        }
    }
});