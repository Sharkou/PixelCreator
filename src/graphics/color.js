export class Color {
    
    static componentToHex(c) {
        var hex = c.toString(16);
        return hex.length == 1 ? '0' + hex : hex;
    }    
    
    /**
     * Convert RGB color to Hex
     * @param {string} r - The red color
     * @param {string} g - The green color
     * @param {string} b - The blue color
     * @return {string} - The Hex color
     */
    static RGBToHex(r, g, b) {
        return '#' + Color.componentToHex(r) + Color.componentToHex(g) + Color.componentToHex(b);
    }
    
    /**
     * Convert Hex color to RGB
     * @param {number} hex - The hexadecimal color
     * @return {string} - The RGB color
     */
    static toColor(hex) {
        
        let b = hex & 0xFF;
        let g = (hex & 0xFF00) >>> 8;
        let r = (hex & 0xFF0000) >>> 16;
        // let a = ( (hex & 0xFF000000) >>> 24 ) / 255;
        
        return 'rgb(' + [r, g, b].join(',') + ')';
    }
    
    /**
     * Create a transparent color
     * @param {string} color - The RGB color
     * @param {number} opacity - The opacity
     * @return {string} - The rgba color
     */
    static createAlphaColor(color, opacity) {
        return [color.slice(0, color.length-1), ', ' + opacity, color.slice(color.length-1)].join('');
    }
}