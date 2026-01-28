import { Component } from '/src/core/mod.js';

/**
 * UI Button component for interactive buttons
 * Handles click events and visual states
 * 
 * @example
 * const button = new Button('Click Me', 100, 50);
 * button.onClick = () => console.log('Clicked!');
 * obj.addComponent(button);
 */
export class Button extends Component {

    /**
     * Create a new button
     * @param {string} text - The button text
     * @param {number} width - The button width
     * @param {number} height - The button height
     */
    constructor(text = 'Button', width = 100, height = 40) {
        super();
        this.text = text;
        this.width = width;
        this.height = height;
        
        // Visual properties
        this.color = '#4a90d9';
        this.hoverColor = '#5a9fe9';
        this.activeColor = '#3a80c9';
        this.disabledColor = '#888888';
        this.textColor = '#ffffff';
        this.borderRadius = 4;
        this.fontSize = 14;
        this.fontFamily = 'Arial, sans-serif';
        
        // State
        this.enabled = true;
        this.hovered = false;
        this.pressed = false;
        this.focused = false;
        
        // Callbacks
        this.onClick = null;
        this.onHover = null;
        this.onPress = null;
        this.onRelease = null;
    }

    /**
     * Get current background color based on state
     * @returns {string} The current color
     */
    get currentColor() {
        if (!this.enabled) return this.disabledColor;
        if (this.pressed) return this.activeColor;
        if (this.hovered) return this.hoverColor;
        return this.color;
    }

    /**
     * Check if point is inside button
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if point is inside
     */
    containsPoint(x, y) {
        const obj = this.object;
        if (!obj) return false;
        
        return x >= obj.x && 
               x <= obj.x + this.width && 
               y >= obj.y && 
               y <= obj.y + this.height;
    }

    /**
     * Handle mouse enter
     */
    onMouseEnter() {
        if (!this.enabled) return;
        this.hovered = true;
        if (this.onHover) this.onHover();
    }

    /**
     * Handle mouse leave
     */
    onMouseLeave() {
        this.hovered = false;
        this.pressed = false;
    }

    /**
     * Handle mouse down
     */
    onMouseDown() {
        if (!this.enabled) return;
        this.pressed = true;
        if (this.onPress) this.onPress();
    }

    /**
     * Handle mouse up
     */
    onMouseUp() {
        if (!this.enabled) return;
        if (this.pressed) {
            if (this.onClick) this.onClick();
        }
        this.pressed = false;
        if (this.onRelease) this.onRelease();
    }

    /**
     * Update button state
     * @param {number} mouseX - Mouse X position
     * @param {number} mouseY - Mouse Y position
     * @param {boolean} mouseDown - Is mouse button down
     */
    update(mouseX, mouseY, mouseDown) {
        const wasHovered = this.hovered;
        const wasPressed = this.pressed;
        
        const isInside = this.containsPoint(mouseX, mouseY);
        
        if (isInside && !wasHovered) {
            this.onMouseEnter();
        } else if (!isInside && wasHovered) {
            this.onMouseLeave();
        }
        
        if (isInside && mouseDown && !wasPressed) {
            this.onMouseDown();
        } else if (!mouseDown && wasPressed) {
            this.onMouseUp();
        }
    }

    /**
     * Render the button
     * @param {CanvasRenderingContext2D} ctx - The rendering context
     * @param {Camera} camera - The camera
     */
    render(ctx, camera) {
        const obj = this.object;
        if (!obj) return;
        
        const x = obj.x - (camera?.x ?? 0);
        const y = obj.y - (camera?.y ?? 0);
        
        // Draw background
        ctx.fillStyle = this.currentColor;
        ctx.beginPath();
        ctx.roundRect(x, y, this.width, this.height, this.borderRadius);
        ctx.fill();
        
        // Draw text
        ctx.fillStyle = this.enabled ? this.textColor : '#cccccc';
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, x + this.width / 2, y + this.height / 2);
    }

    /**
     * Enable the button
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable the button
     */
    disable() {
        this.enabled = false;
        this.hovered = false;
        this.pressed = false;
    }

    /**
     * Set button text
     * @param {string} text - The new text
     */
    setText(text) {
        this.text = text;
    }

    /**
     * Set button size
     * @param {number} width - The width
     * @param {number} height - The height
     */
    setSize(width, height) {
        this.width = width;
        this.height = height;
    }

    /**
     * Set button colors
     * @param {Object} colors - Color configuration
     */
    setColors({ normal, hover, active, disabled, text } = {}) {
        if (normal) this.color = normal;
        if (hover) this.hoverColor = hover;
        if (active) this.activeColor = active;
        if (disabled) this.disabledColor = disabled;
        if (text) this.textColor = text;
    }

    /**
     * Clone the button
     * @returns {Button} A new button with same properties
     */
    clone() {
        const button = new Button(this.text, this.width, this.height);
        button.color = this.color;
        button.hoverColor = this.hoverColor;
        button.activeColor = this.activeColor;
        button.disabledColor = this.disabledColor;
        button.textColor = this.textColor;
        button.borderRadius = this.borderRadius;
        button.fontSize = this.fontSize;
        button.fontFamily = this.fontFamily;
        button.enabled = this.enabled;
        return button;
    }
}