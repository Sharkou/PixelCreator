import { System } from '/src/core/system.js';
import { Network } from '/src/network/network.js';

export class Loader {

    static url = '';
    static modules = [];
    static files = {};
    static allowedTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/svg+xml', 'text/javascript', 'application/javascript', 'application/px'];
    static allowedImagesTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/svg+xml'];
    static allowedScriptsTypes = ['text/javascript', 'application/javascript', 'application/px'];
    
    /**
     * Initialize files
     * @constructor
     * @param {array} files - The project files
     */
    static init(files) {
        if (files) {
            for (let file of files) {
                this.add(file);
            }
        }
    }

    /**
     * Add file to file list
     * @param {File} file - The file
     */
    static add(file, dispatch = true) {

        if (!file) return;

        /* switch (file.type) {
            case 'image/png':
            case 'image/jpg':
            case 'image/jpeg':
            case 'image/gif':
                this.files[file.id] = file.image;
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
                this.files[file.id] = file.value;
        } */

        this.files[file.id] = file;

        if (dispatch) {
            System.dispatchEvent('add_file', file);
        }
    }

    /**
     * Remove file from file list
     * @param {Object} file - The file
     */
    static remove(file, dispatch = true) {

        if (!file) return;

        delete this.files[file.id];

        // console.log('%cinfo: File deleted: ' + file.id, 'color: #3b78ff');

        if (dispatch) {
            System.dispatchEvent('remove_file', file);
        }
    }

    static contains(fileName) {
        for (let i in this.files) {
            if (this.files[i].name === fileName) {
                return true;
            }
        }
        return false;
    }

    /**
     * Import script
     * @param {string} url - The script url
     * @returns {Module} module - The imported module
     */
    static async import(url, dispatch = true) {
        // this.modules.push(await import('/plugins/' + url + '.js'));
        // console.log(url);
        try {
            let module = await import(url);
            // console.log(url);
            if (dispatch) {
                System.dispatchEvent('import', module.default);
            }
            return module;
        } catch (err) {
            throw err;
        }
    }

    /**
     * Load resource
     * @param {string} url - The file path
     */
    static async load(url, dispatch = true) {

        // console.log(url);

        const path = url.split('/');
        const folder = (path[0] === '' ? '/' : path[0]);
        const name = path[1];
        const blob = await fetch(`${this.url}${folder}${name}`)
        .then(res => res.blob())
        .catch(err => {
            // TODO: Manage failed access
            console.error(err);
            return;
        });
        const type = blob.type;
        // const objectURL = URL.createObjectURL(blob);
        // console.log(blob);

        // Authorized file
        if (this.allowedTypes.indexOf(type) !== -1) {

            // Create the resource
            // let resource = new Resource(name.split('.')[0], name.split('.')[1], type, folder);
            let file = System.createFile(name, type, folder, blob);

            // console.log(file);

            // Image file
            if (this.allowedImagesTypes.indexOf(type) !== -1) {
                const img = await this.createImage(blob); // await Texture.load(objectURL);
                file.value = img.src;
                file.image = img;
            } else if (this.allowedScriptsTypes.indexOf(type) !== -1) {
                const text = await this.readAsText(blob);
                file.value = text;
                await Loader.createScriptComponent(file);
            }

            console.log('%cinfo: File loaded: ' + file.id, 'color: #3b78ff');
            // console.log(file);
            
            this.add(file);

            if (dispatch) {
                System.dispatchEvent('load_file', file);
            }

            return file;
        }
    }

    /**
     * Download project files
     * @param {string} url - The project url
     */
    static async download(url, dispatch = true) {

        this.url = url;

        const filesList = await fetch(url + '/data')
            .then(response => response.json())
            .catch(error => console.error);
        
        let files = [];
        let progress = 0;

        if (filesList.length == 0) {
            return null;
        }
        
        // console.log('%cinfo: Progress: ' + progress + '%', 'color: #3b78ff');
        // console.log(filesList);

        for (let i = 0; i < filesList.length; i++) {

            let file = await this.load(filesList[i], false);
            files.push(file);

            progress = (((i + 1) * 100) / (filesList.length)).toFixed(2);
            // console.log('%cinfo: Progress: ' + progress + '%', 'color: #3b78ff');

            if (progress == 100) {

                // console.log(files);
                // this.init(files);

                if (dispatch) {
                    System.dispatchEvent('download_files', files);
                }

                return new Promise((resolve, reject) => {
                    resolve(files);
                });
            }
        }
    }

    static async update(file, dispatch = true) {
        let id = file.id;
        let xhr = new XMLHttpRequest();
        xhr.open('PUT', `${Network.protocol}://${Network.host}:${Network.port}`);
        xhr.send(JSON.stringify(file));

        xhr.addEventListener('load', () => {
            console.log('%cinfo: File updated: ' + id, 'color: #3b78ff');

            if (dispatch) {
                System.dispatchEvent('update_file', file);
            }
        });
    }

    static async delete(file, dispatch = true) {
        let id = file.id;
        let xhr = new XMLHttpRequest();
        xhr.open('DELETE', `${Network.protocol}://${Network.host}:${Network.port}`);
        xhr.send(id);

        xhr.addEventListener('load', () => {
            console.log('%cinfo: File deleted: ' + id, 'color: #3b78ff');
            this.remove(this.files[id]);

            if (dispatch) {
                System.dispatchEvent('delete_file', file);
            }
        });
    }

    /**
     * Upload files to server
     * @param {Array} files - The files to add
     */
    static async uploadFiles(files, dispatch = true) {
        let filesLen = files.length;
        let fileName = '';
        let fileType = '';
        let path = '/';

        // console.log(files);

        for (let i = 0; i < filesLen; i++) {

            // let file = files[i];
            // console.log(file);

            fileName = files[i].name;
            fileType = files[i].type;
            // fileType = fileName.split('.');
            // fileType = fileType[fileType.length - 1];

            // Upload to server
            let xhr = new XMLHttpRequest();
            xhr.open('POST', `${Network.protocol}://${Network.host}:${Network.port}`);

            // console.log(fileType);

            // Authorized filecreateObjectURL
            if (this.allowedTypes.indexOf(fileType) !== -1) {

                // Create the resource
                // resource = new Resource(fileName.split('.')[0], fileName.split('.')[1], fileType, path);
                let file = System.createFile(fileName, fileType, path, files[i]);
                // console.log(fileName);

                // Image file
                if (this.allowedImagesTypes.indexOf(fileType) !== -1) {

                    const img = await this.createImage(file);
                    file.value = img.src;

                    // let form = new FormData();
                    // form.append('file', file);
                    // form.append('path', path);
                    // xhr.send(form);

                    xhr.send(JSON.stringify(file));
                    
                    file.image = img;

                // Script file
                } else if (this.allowedScriptsTypes.indexOf(fileType) !== -1) {
                    
                    let text = await this.readAsText(file);
                    file.value = text;

                    xhr.send(JSON.stringify(file));
                }
                
                this.add(file);

                xhr.upload.addEventListener('progress', function(e) {
                    // progress.value = e.loaded;
                    // progress.max = e.total;
                });
    
                xhr.addEventListener('load', function() {
                    console.log('%cinfo: Upload ' + file.id + ' completed!', 'color: #3b78ff');
    
                    if (dispatch) {
                        System.dispatchEvent('upload_file', file);
                    }
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

    static readAsText(file) {

        return new Promise(resolve => {
            
            let reader = new FileReader();
        
            reader.addEventListener('load', function() {
                let text = reader.result;
                resolve(text);
            });
            
            reader.readAsText(file);
        });
    } 

    static readAsArrayBuffer(file) {

        var reader = new FileReader();
        
        reader.addEventListener('load', function() {
            
        });
        
        reader.readAsArrayBuffer(file);
    }

    static createURL(file, type) {
        let newFile = new File([file.value], file.name + '.' + file.extension, {
            type: type
        });
        return URL.createObjectURL(newFile);
    }

    static createScript(src, type) {
        let script = document.createElement('script');
        script.onload = () => {
            return new Promise(resolve => {
                resolve(script);
            });
        };
        if (type) script.type = type;
        script.src = src;
        // document.head.appendChild(script);
    }

    static async createScriptComponent(file) {
        let url = Loader.createURL(file, 'application/javascript');
        Loader.import(url).then(module => {
            file.module = module;
            file.component = module.default;
            // return module.default;
        }).catch(err => {
            // console.error(err);
            throw err;
        });
    }
}

// Update files on change
System.addEventListener('setProperty', async data => {
    const obj = data.object;
    const prop = data.prop;
    const value = data.value;
    const type = obj.type;
    if (type) {
        if (Loader.allowedTypes.indexOf(type) !== -1) {
            if (Loader.allowedScriptsTypes.indexOf(obj.type) !== -1) {
                let script = Loader.files[obj.id];
                if (script) {
                    script['_' + prop] = value;
                    if (prop === 'name') {
                        script.value = script.value.replace(/(class )([a-zA-Z0-9$_]+)( {)/, '$1' + value.replace(/\s/g, '') + '$3');
                        // script.id = script.path + script.name;
                    }
                    await Loader.createScriptComponent(script);
                }
            }
        }
    }
});