import { System } from '/src/core/system.js';
import { Resource } from '/src/core/resource.js';

export class Loader {

    static url = '';
    static modules = [];
    static files = {};
    static allowedTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/svg+xml', 'application/javascript', 'application/px'];
    static allowedImagesTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/svg+xml'];
    static allowedScriptsTypes = ['application/javascript', 'application/px'];
    
    /**
     * Initialize files
     * @constructor
     * @param {array} resources - The project resources
     */
    static init(resources) {
        if (resources) {
            for (let resource of resources) {
                this.add(resource);
            }
        }
    }

    /**
     * Add file to file list
     * @param {Object} obj - The resource
     */
    static add(obj) {

        if (!obj) return;

        switch (obj.type) {
            case 'image/png':
            case 'image/jpg':
            case 'image/jpeg':
            case 'image/gif':
                this.files[obj.id] = obj.image;
                break;
            case 'text/html':
            case 'text/css':
            case 'text/plain':
            case 'image/svg+xml':
            case 'application/json':
            case 'application/javascript':
            case 'application/wasm':
            case 'application/px':
            default:
                this.files[obj.id] = obj.value;
        }
    }

    /**
     * Remove file from file list
     * @param {Object} obj - The object
     */
    static remove(obj) {
        delete this.files[obj.id];
    }

    /**
     * Import script
     * @param {string} url - The script url
     */
    static async import(url) {
        this.modules.push(await import('/plugins/' + url + '.js'));
    }

    /**
     * Load resource
     * @param {string} url - The resource url
     */
    static async load(url, dispatch = true) {

        // console.log(url);

        const path = url.split('/');
        const folder = path[0];
        const name = path[1];
        const blob = await fetch(`${this.url}${folder}/${name}`).then(res => res.blob()); // .catch(error => console.error)
        const type = blob.type;
        // const objectURL = URL.createObjectURL(blob);
        // console.log(blob);

        // Authorized file
        if (this.allowedTypes.indexOf(type) !== -1) {

            // Create the resource
            let resource = new Resource(name.split('.')[0], name.split('.')[1], type, folder);

            // Image file
            if (this.allowedImagesTypes.indexOf(type) !== -1) {
                const img = await this.createImage(blob); // await Texture.load(objectURL);
                resource.value = img.src;
                resource.image = img;
                resource.sync();
            }

            console.log('%cinfo: File loaded: ' + resource.id, 'color: #3b78ff');
            // console.log(resource);

            if (dispatch) {
                this.add(resource);
                System.dispatchEvent('load_file', resource);
            }

            return resource;
        }
    }

    /**
     * Download project resources
     * @param {string} url - The project url
     */
    static async download(url, dispatch = true) {

        this.url = url;

        const files = await fetch(url + '/data')
            .then(response => response.json())
            .catch(error => console.error);
        
        let resources = [];
        let progress = 0;

        if (files.length == 0) {
            return null;
        }
        
        console.log('%cinfo: Progress: ' + progress + '%', 'color: #3b78ff');
        // console.log(files);

        for (let i = 0; i < files.length; i++) {

            let resource = await this.load(files[i], false);
            resources.push(resource);

            progress = (((i + 1) * 100) / (files.length)).toFixed(2);
            console.log('%cinfo: Progress: ' + progress + '%', 'color: #3b78ff');

            if (progress == 100) {

                // console.log(resources);

                if (dispatch) {
                    System.dispatchEvent('download_files', resources);
                }

                return new Promise((resolve, reject) => {
                    this.init(resources);
                    resolve(resources);
                });
            }
        }
    }

    /**
     * Create image from file
     * @param {File} file - The file/blob
     * @param {Function} callback - The callback function
     */
    static createImage(file, callback) {

        return new Promise(resolve => {
            
            let reader = new FileReader();

            // console.log(file);
            // console.log(reader);
            
            reader.addEventListener('load', function() {
                let img = new Image();
                img.src = this.result;

                resolve(img);
                
                // callback(img);
            });
            
            reader.readAsDataURL(file);
        });
    }

    static readAsArrayBuffer(file) {

        var reader = new FileReader();
        
        reader.addEventListener('load', function() {
            
        });
        
        reader.readAsArrayBuffer(file);
    }
}