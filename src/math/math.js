// Linear interpolation between two values
Math.lerp = function (value1, value2, amount) {
	amount = amount < 0 ? 0 : amount;
	amount = amount > 1 ? 1 : amount;
	return value1 + (value2 - value1) * amount;
};

// Clamp a value between min and max
Math.clamp = function (value, min, max) {
	return value < min ? min : value > max ? max : value;
};

// Map a value from one range to another
Math.map = function (value, inMin, inMax, outMin, outMax) {
	return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
};

// Distance between two points
Math.distance = function (x1, y1, x2, y2) {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return Math.sqrt(dx * dx + dy * dy);
};

// Angle in radians from point (x1, y1) to (x2, y2)
Math.angle = function (x1, y1, x2, y2) {
	return Math.atan2(y2 - y1, x2 - x1);
};

// Convert degrees to radians
Math.degToRad = function (degrees) {
	return degrees * (Math.PI / 180);
};

// Convert radians to degrees
Math.radToDeg = function (radians) {
	return radians * (180 / Math.PI);
};

// Smooth step interpolation (ease-in-out)
Math.smoothstep = function (value, min, max) {
	const t = Math.clamp((value - min) / (max - min), 0, 1);
	return t * t * (3 - 2 * t);
};

// Inverse lerp: returns 0-1 progress of value between a and b
Math.inverseLerp = function (a, b, value) {
	if (a === b) return 0;
	return Math.clamp((value - a) / (b - a), 0, 1);
};

// Wrap value around a range (e.g., angles wrapping 0-360)
Math.wrap = function (value, min, max) {
	const range = max - min;
	return min + ((((value - min) % range) + range) % range);
};