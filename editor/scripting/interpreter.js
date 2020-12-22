import { Scene } from '/src/core/scene.js';
import { Editor } from '/src/editor/scripting/editor.js';

export class Interpreter {

    static window = null;
    
    static open(id, name, data) {
        this.window = window.open('/src/editor/scripting/script.html', '_blank', 'directories=no,fullscreen=yes,titlebar=no,toolbar=no,location=no,status=yes,menubar=no,scrollbars=no,resizable=yes,width=800,height=500');
        this.window.data = {
            id: id,
            name: name,
            data: data
        };
        // this.window.init();
    }
    
    static run(source) {

        /* Compilation des sources */
        try {
            // Project.lastScript.data = eval('(' + source + ')');
            let data = eval('(' + source + ')');

            // Test errors on methods
            // let component = new Project.lastScript.data();
            let component = new data();

            if (component.update) {
                component.update();
            }

            if (component.draw) {
                component.draw();
            }
            
            // Reference vers la classe depuis l'objet global window
            window[data.name] = data;
            
            return data;
        }

        catch (error) {
            /* TypeError levé quand on utilise les propriétés des autres composants
               du même object parent */
            if (error.name == 'TypeError') {
                let data = eval('(' + source + ')'); // on compile quand même !
                return data;
            } else if (error instanceof SyntaxError) {
                console.error(error.message);
            } else {
                // console.error(error);
                return null; // stop compilation on error
            }            
        }
    }
    
    static update(script) {
        
        if (script.data) {
            let name = script.data.name.toLowerCase();
            const scene = Scene.main;
            
            // On change le nom de la ressource par le nom de la classe
            Project.files[this.window.data.id].name = script.data.name;
            
            // Mise à jour de la ressource dans l'éditeur
            scene.refresh();
            
            // Update in realtime
            for (let id in scene.objects) {
        
                const obj = scene.objects[id]; // stockage de l'objet dans une constante
                
                if (obj.components) {
                    for (let component in obj.components) {
                        if (component === name) {
                            obj.addComponent(new script.data());

                            // Update properties
                            if (obj == scene.current) {
                                Properties.setCurrentObject(scene.current);
                                Properties.updateProperties();
                                Properties.updateComponentsProperties();
                            }
                        }
                    }
                }
            }
        }
    }
}