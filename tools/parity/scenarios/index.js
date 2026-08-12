import propertyPaths from './01-property-paths.js';
import hierarchy from './02-hierarchy.js';
import components from './03-components.js';
import scene from './04-scene.js';
import serialization from './05-serialization.js';
import network from './06-network.js';

export const scenarios = [
    ...propertyPaths,
    ...hierarchy,
    ...components,
    ...scene,
    ...serialization,
    ...network
];
