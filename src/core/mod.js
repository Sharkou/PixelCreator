// Public entry point of the v2 core.
//
// This layer is shared by client, server and Editor. It depends on nothing: no DOM, no
// rendering backend, no network, no Editor, and not the Project layer either. That is what
// lets a server run the same model as a browser, and what lets the whole core be tested
// under Node.

export { createId } from './id.js';
export { Emitter } from './events.js';

export { Origin, currentOrigin, withOrigin } from './properties/origin.js';
export { observe, isReactive, applyProperty, makeReactive } from './properties/reactive.js';
export {
    PropertyType,
    isPropertyType,
    propertyTypes,
    defaultForProperty,
    isValidValue
} from './properties/types.js';

export {
    OperationType,
    createOperation,
    setPropertyOperation,
    addObjectOperation,
    removeObjectOperation,
    addComponentOperation,
    removeComponentOperation,
    moveComponentOperation,
    reparentOperation,
    addResourceOperation,
    removeResourceOperation
} from './operations/operation.js';
export { invert, invertible } from './operations/invert.js';
export { Operations } from './operations/operations.js';
export { AllowAllAuthority, PredicateAuthority, allow, deny } from './operations/authority.js';

export { Object } from './object.js';
export { Scene } from './scene.js';
export {
    ComponentRegistry,
    components,
    componentType,
    componentLabel,
    componentExposes,
    componentSchema,
    instantiateComponent,
    reconcileValues
} from './component.js';
export { missingComponent, isMissingComponent } from './missing.js';
export { defineComponent, componentDefinition, componentGraphId } from './definition.js';

export { Matrix } from './math/matrix.js';
export { Transform, localMatrix, worldMatrix, worldPosition } from './components/transform.js';

export {
    FORMAT_VERSION,
    serializeObject,
    serializeComponent,
    serializeComponents,
    serializeScene,
    deserializeObject,
    deserializeScene,
    restoreSubtree
} from './serialize.js';
