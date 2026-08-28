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
    copyValue,
    defaultForProperty,
    elementOf,
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
    moveResourceOperation,
    removeResourceOperation
} from './operations/operation.js';
export {
    addNodeOperation,
    removeNodeOperation,
    connectOperation,
    disconnectOperation,
    addPropertyOperation,
    removePropertyOperation
} from './operations/graph-operations.js';
export { invert, invertible } from './operations/invert.js';
export { Operations } from './operations/operations.js';
export { AllowAllAuthority, PredicateAuthority, allow, deny } from './operations/authority.js';

export { Object } from './object.js';
export { Scene, hierarchyOrder } from './scene.js';
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
export { defineComponent, componentDefinition, componentGraph, declaredProperties } from './definition.js';

// The `.px` graph: its model, its catalogue of node types, and the rules that say whether
// a graph is runnable (ADR-0027). All of it is Core because all of it is shared — the
// Editor draws it, the Runtime interprets it, and a headless build checks it.
export {
    ANY_TYPE,
    NODE_CATEGORIES,
    OBJECT_TYPE,
    NodeRegistry,
    PortDirection,
    PortKind,
    baseTypeOf,
    createPort,
    compatibleTargets,
    groupNodes,
    portTypeOf,
    nodes,
    portOf,
    portsOf,
    shapeDependsOnNode,
    typesCompatible
} from './graph/nodes.js';
export {
    COMPONENT_REFERENCE,
    KEY_REFERENCE,
    OBJECT_SOCKET_REFERENCE,
    PROPERTY_REFERENCE,
    STANDARD_NODES,
    referencedComponent,
    referencedComponentProperty,
    referencedProperty,
    registerStandardNodes,
    targetSocket
} from './graph/standard.js';
export { GRAPH_VERSION, Graph, createConnection, createNode, migrateNode } from './graph/graph.js';
export { DEFAULT_PROPERTY_TYPE, ComponentDefinition } from './graph/definition.js';
export { GraphError, GraphIssueCode, GraphSeverity, firstError, graphIssue } from './graph/errors.js';
export { runnable, validateGraph } from './graph/validate.js';

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
    restoreScene,
    restoreSubtree
} from './serialize.js';
