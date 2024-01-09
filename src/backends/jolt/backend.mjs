import joltInfo from "jolt-physics/package.json";

import {
    BUFFER_WRITE_BOOL,
    BUFFER_WRITE_JOLTVEC32,
    BUFFER_WRITE_UINT32, BUFFER_WRITE_UINT8, BUFFER_WRITE_VEC32,
    CMD_UPDATE_TRANSFORMS, COMPONENT_SYSTEM_BODY, COMPONENT_SYSTEM_CHAR,
    OPERATOR_CLEANER, OPERATOR_CREATOR, OPERATOR_MODIFIER, OPERATOR_QUERIER
} from "../../physics/components/jolt/constants.mjs";
import { Debug } from "../../physics/debug.mjs";
import { extendMath } from "../../physics/math.mjs";
import { CommandsBuffer } from "./commands-buffer.mjs";
import { Cleaner } from "./operators/cleaner.mjs";
import { Creator } from "./operators/creator.mjs";
import { Drawer } from "./operators/drawer.mjs";
import { Listener } from "./operators/listener.mjs";
import { Modifier } from "./operators/modifier.mjs";
import { Querier } from "./operators/querier.mjs";
import { Tracker } from "./operators/tracker.mjs";

class JoltBackend {
    constructor(messenger, config) {
        // TODO
        // add webworker
        if (!window || !window.Jolt) return;

        config = {
            // Physics Settings
            // https://jrouwe.github.io/JoltPhysics/struct_physics_settings.html
            baumgarte: 0.2,
            bodyPairCacheCosMaxDeltaRotationDiv2: 0.9998476951563912,
            bodyPairCacheMaxDeltaPositionSq: Math.sqrt(0.001),
            contactNormalCosMaxDeltaRotation: 0.9961946980917455,
            contactPointPreserveLambdaMaxDistSq: Math.sqrt(0.01),
            deterministicSimulation: true,
            linearCastMaxPenetration: 0.25,
            linearCastThreshold: 0.75,
            manifoldToleranceSq: 1.0e-6,
            maxInFlightBodyPairs: 16384,
            maxPenetrationDistance: 0.2,
            minVelocityForRestitution: 1,
            numPositionSteps: 2,
            numVelocitySteps: 10,
            penetrationSlop: 0.02,
            pointVelocitySleepThreshold: 0.03,
            speculativeContactDistance: 0.02,
            stepListenerBatchesPerJob: 1,
            stepListenersBatchSize: 8,
            timeBeforeSleep: 0.5,
            // for debugging
            constraintWarmStart: true,
            useBodyPairContactCache: true,
            useManifoldReduction: true,
            useLargeIslandSplitter: true,
            allowSleeping: true,
            checkActiveEdges: true,
            // contact events
            charContactEventsEnabled: true,
            vehicleContactEventsEnabled: false,
            contactEventsEnabled: true,
            contactAddedEventsEnabled: true,
            contactPersistedEventsEnabled: false,
            contactRemovedEventsEnabled: true,
            contactPoints: true,
            contactPointsAveraged: true,
            // object layers
            layerPairs: [
                [ 0, 1 ],   // non-moving, moving
                [ 1, 1 ]    // moving, moving
            ],
            ...config
        };
        this._config = config;
        this._time = 0;

        // Transform filters to bit values
        this._filterLayers = new Map();
        this._filterToBits(config);

        // Jolt specific
        this._joltInterface = null;
        this._physicsSystem = null;
        this._bodyInterface = null;
        this._bpFilter = null;
        this._objFilter = null;
        this._bodyFilter = null;
        this._shapeFilter = null;
        this._bodyList = null;
        this._groupFilterTables = [];

        // Physics operators
        this._creator = new Creator(this);
        this._modifier = new Modifier(this);
        this._cleaner = new Cleaner(this);
        this._querier = new Querier(this);
        this._tracker = new Tracker(this);
        this._drawer = new Drawer();
        
        const listener = new Listener(this);

        if (config.contactEventsEnabled) {
            listener.initEvents(config);
        }

        this._listener = listener;

        this._outBuffer = new CommandsBuffer({ ...this._config, commandsBufferSize: 2000 });

        // Util
        extendMath();

        this._stepTime = 0;
        this._steps = 0;

        this._responseMessage = { buffer: null };
        this._dispatcher = messenger;
        this._inBuffer = null;
        this._fatalError = false;

        if (Debug.dev) {
            this._perfIndex = null;
        }

        this._exposeConstants();
    }

    set joltInterface(joltInterface) {
        this._joltInterface = joltInterface;
    }

    get joltInterface() {
        return this._joltInterface;
    }

    get physicsSystem() {
        return this._physicsSystem;
    }
    set physicsSystem(system) {
        this._physicsSystem = system;
        this._bodyInterface = system.GetBodyInterface();
    }

    get groupFilterTables() {
        return this._groupFilterTables;
    }

    get bodyInterface() {
        return this._bodyInterface;
    }

    get inBuffer() {
        return this._inBuffer;
    }

    get outBuffer() {
        return this._outBuffer;
    }

    get config() {
        return this._config;
    }

    get tracker() {
        return this._tracker;
    }

    get creator() {
        return this._creator;
    }

    get listener() {
        return this._listener;
    }

    get querier() {
        return this._querier;
    }

    get bpFilter() {
        return this._bpFilter;
    }

    set bpFilter(filter) {
        this._bpFilter = filter;
    }

    get objFilter() {
        return this._objFilter;
    }

    set objFilter(filter) {
        this._objFilter = filter;
    }

    get bodyFilter() {
        return this._bodyFilter;
    }

    set bodyFilter(filter) {
        this._bodyFilter = filter;
    }

    get shapeFilter() {
        return this._shapeFilter;
    }

    set shapeFilter(filter) {
        this._shapeFilter = filter;
    }

    get bodyList() {
        return this._bodyList;
    }

    set bodyList(list) {
        this._bodyList = list;
    }

    step(data) {
        if (this._fatalError) return;
        
        if (Debug.dev) {
            this._stepTime = performance.now();
            this._perfIndex = data.perfIndex;
        }
        
        const { buffer, meshBuffers, dt } = data;
        let inBuffer = this._inBuffer;

        let ok = true;
        if (buffer) {
            if (!inBuffer) {
                inBuffer = this._inBuffer = new CommandsBuffer();
                inBuffer.buffer = buffer;
            }

            // If commands buffer is provided, then execute commands, before stepping
            try {
                ok = ok && this._executeCommands(meshBuffers);
            } catch (e) {
                Debug.dev && Debug.error(e);
                ok = false;
            }
        }

        if (!inBuffer) {
            // The physics world is empty, as no commands were ever received yet,
            // so nothing to report and no reason to step the physics.
            return;
        }

        const outBuffer = this._outBuffer;
        // // reset the out buffer cursors, so we can start writing results to it
        // outBuffer.reset();

        // // get ready to collect contacts
        // this._listener.reset();

        // potentially step physics system, update motion states
        ok = ok && this._stepPhysics(dt);

        // write the collected contact events
        this._listener.write(outBuffer);

        // write dynamic transforms to update entities
        ok = ok && this._writeIsometry(outBuffer);

        // write virtual characters state
        ok = ok && this._writeCharacters(outBuffer);

        // write debug draw data
        if (Debug.dev) {
            // Write debug draw data
            ok = ok && this._drawer.write(this._tracker);
        }

        // report sim results to frontend
        ok = ok && this._send();

        if (!ok) {
            Debug.dev && Debug.error('Backend fatal error :(');
            this._fatalError = true;
        }
    }

    overrideContacts(listener, overrides) {
        this._listener.overrideContacts(listener, overrides);
    }

    getBitValue(name) {
        const layers = this._filterLayers;

        if (!layers.has(name)) {
            layers.set(name, layers.size ? 1 << layers.size - 1 : 0);
        }

        return layers.get(name);
    }

    destroy() {
        this._creator.destroy();
        this._creator = null;

        this._modifier.destroy();
        this._modifier = null;

        this._cleaner.destroy();
        this._cleaner = null;

        this._querier.destroy();
        this._querier = null;

        this._tracker.destroy();
        this._tracker = null;

        this._dispatcher = null;

        if (this._charUpdateSettings) {
            Jolt.destroy(this._charUpdateSettings);
            this._charUpdateSettings = null;
        }

        if (this._joltInterface) {
            Jolt.destroy(this._joltInterface);
            this._joltInterface = null;
        }

        const tables = this._groupFilterTables;
        const len = tables.length;
        if (len > 0) {
            for (let i = 0; i < len; i++) {
                const table = tables[i];
                Jolt.destroy(table);
            }
            tables.length = 0;
        }

        Jolt.destroy(this._bodyList);
        this._bodyList = null;

        this._inBuffer?.destroy();
        this._inBuffer = null;

        this._outBuffer?.destroy();
        this._outBuffer = null;
    }

    _stepPhysics(dt) {
        const config = this._config;
        const fixedStep = config.fixedStep;
        const subSteps = config.subSteps;
        const jolt = this._joltInterface;

        let time = this._time;
        let stepped = false;
        let ok = true;

        time += dt;

        while (ok && time >= fixedStep) {
            try {
                // update characters before stepping
                ok = this._updateCharacters(fixedStep);
                // step the physics world
                ok && jolt.Step(fixedStep, subSteps);
                this._steps++;
                stepped = true;
            } catch (e) {
                Debug.dev && Debug.error(e);
                ok = false;
            }

            time -= fixedStep;
        }

        if (ok && config.useMotionStates) {
            ok = this._updateMotionStates(time / fixedStep, stepped);
        }

        this._time = time;

        return ok;
    }

    _updateMotionStates(alpha, stepped) {
        const tracker = this._tracker;
        const system = this._physicsSystem;
        const characters = tracker.character;
        const dynamicType = Jolt.EBodyType_RigidBody;

        // active dynamic and active kinematic
        const numActiveBodies = system.GetNumActiveBodies(dynamicType);
        if (numActiveBodies > 0) {
            const bodyList = this._bodyList;

            bodyList.clear();
            system.GetActiveBodies(dynamicType, bodyList);
            
            for (let i = 0; i < numActiveBodies; i++) {
                const bodyID = bodyList.at(i);
                const body = system.GetBodyLockInterface().TryGetBody(bodyID);
                if (Jolt.getPointer(body) === 0) {
                    continue;
                }

                const ms = body.motionState;
                if (ms) {
                    ms.compute(alpha, stepped);
                }
            }
        }

        for (const char of characters) {
            const ms = char.motionState;
            if (ms) {
                const ok = ms.compute(alpha, stepped);
                if (Debug.dev && !ok) {
                    return false;
                }
            }
        }

        return true;
    }

    _updateCharacters(fixedStep) {
        const characters = this._tracker.character;
        if (characters.size === 0) return true;

        const movingBPFilter = this._bpFilter;
        const movingLayerFilter = this._objFilter;
        const bodyFilter = this._bodyFilter;
        const shapeFilter = this._shapeFilter;
        let updateSettings = this._charUpdateSettings;

        try {
            if (!updateSettings) {
                updateSettings = this._charUpdateSettings = new Jolt.ExtendedUpdateSettings();
            }
            const allocator = this._joltInterface.GetTempAllocator();
    
            characters.forEach(char => {
                char.ExtendedUpdate(
                    fixedStep,
                    char.GetUp(),
                    updateSettings,
                    movingBPFilter,
                    movingLayerFilter,
                    bodyFilter,
                    shapeFilter,
                    allocator
                );
                char.UpdateGroundVelocity();
            });
        } catch (e) {
            Debug.dev && Debug.error(e);
            return false;
        }

        return true;
    }

    _executeCommands(meshBuffers) {
        const cb = this._inBuffer;
        const creator = this._creator;
        const modifier = this._modifier;
        const querier = this._querier;
        const cleaner = this._cleaner;
        const count = cb.commandsCount;

        let ok = true;

        for (let i = 0; i < count; i++) {
            const operator = cb.readOperator();

            switch (operator) {
                case OPERATOR_CREATOR:
                    ok = ok && creator.create(meshBuffers);
                    break;

                case OPERATOR_MODIFIER:
                    ok = ok && modifier.modify();
                    break;

                case OPERATOR_QUERIER:
                    ok = ok && querier.query();
                    break;

                case OPERATOR_CLEANER:
                    ok = ok && cleaner.clean();
                    break;

                default:
                    Debug.dev && Debug.error(`Invalid operator: ${ operator }`);
                    return false;
            }
        }

        // Reset the cursors, so we can start from the buffer beginning on
        // the next step request
        cb.reset();

        return ok;
    }

    _writeIsometry(cb) {
        // Report transforms of dynamic bodies
        const tracker = this._tracker;
        const system = this._physicsSystem;
        const dynamicType = Jolt.EBodyType_RigidBody;
        const numActiveBodies = system.GetNumActiveBodies(dynamicType);
        if (numActiveBodies > 0) {    
            const useMotionStates = this._config.useMotionStates;
            const bodyList = this._bodyList;

            try {
                bodyList.clear();
                system.GetActiveBodies(dynamicType, bodyList);
    
                for (let i = 0; i < numActiveBodies; i++) {
                    const bodyID = bodyList.at(i);
                    const body = system.GetBodyLockInterface().TryGetBody(bodyID);
                    const pointer = Jolt.getPointer(body);
    
                    if (pointer === 0)
                        continue;
    
                    cb.writeOperator(COMPONENT_SYSTEM_BODY);
                    cb.writeCommand(CMD_UPDATE_TRANSFORMS);
    
                    const index = tracker.getPCID(Jolt.getPointer(body));
                    cb.write(index, BUFFER_WRITE_UINT32, false);
    
                    const ms = body.motionState;
                    if (useMotionStates && ms) {
                        cb.write(ms.position, BUFFER_WRITE_VEC32, false);
                        cb.write(ms.rotation, BUFFER_WRITE_VEC32, false);
                    } else {
                        cb.write(body.GetPosition(), BUFFER_WRITE_JOLTVEC32, false);
                        cb.write(body.GetRotation(), BUFFER_WRITE_JOLTVEC32, false);
                    }
    
                    cb.write(body.GetLinearVelocity(), BUFFER_WRITE_JOLTVEC32, false);
                    cb.write(body.GetAngularVelocity(), BUFFER_WRITE_JOLTVEC32, false);

                    // If it is a vehicle, write wheels isometry as well
                    if (body.isVehicle) {
                        const data = tracker.constraintMap.get(index);
                        const constraint = data.constraint;
                        const wheelsCount = constraint.wheelsCount;
                        const modifier = this._modifier;

                        const jv1 = modifier.joltVec3_1;
                        const jv2 = modifier.joltVec3_2;

                        jv1.Set(0, 1, 0);
                        jv2.Set(1, 0, 0);
    
                        for (let i = 0; i < wheelsCount; i++) {
                            const transform = constraint.GetWheelLocalTransform(i, jv1, jv2);

                            cb.write(transform.GetTranslation(), BUFFER_WRITE_JOLTVEC32, false);
                            cb.write(transform.GetRotation().GetQuaternion(), BUFFER_WRITE_JOLTVEC32, false);
                        }
                    }
                }

            } catch (e) {
                Debug.dev && Debug.error(e);
                return false;
            }
        }

        return true;
    }

    _writeCharacters(cb) {
        const tracker = this._tracker;
        const characters = tracker.character;
        const count = characters.size;

        if (count === 0)
            return true;

        const useMotionStates = this._config.useMotionStates;

        cb.writeOperator(COMPONENT_SYSTEM_CHAR);
        cb.writeCommand(CMD_UPDATE_TRANSFORMS);
        cb.write(count, BUFFER_WRITE_UINT32, false);

        try {
            characters.forEach(char => {
                const index = tracker.getPCID(Jolt.getPointer(char));
                const isSupported = char.IsSupported();
                const state = char.GetGroundState();
                const linVel = char.GetLinearVelocity();
                const groundVelocity = char.GetGroundVelocity();
                const groundNormal = char.GetGroundNormal();
                const isTooSteep = char.IsSlopeTooSteep(groundNormal);

                cb.write(index, BUFFER_WRITE_UINT32, false);

                const ms = char.motionState;
                if (useMotionStates && ms) {
                    cb.write(ms.position, BUFFER_WRITE_VEC32, false);
                    cb.write(ms.rotation, BUFFER_WRITE_VEC32, false);
                } else {
                    cb.write(char.GetPosition(), BUFFER_WRITE_JOLTVEC32, false);
                    cb.write(char.GetRotation(), BUFFER_WRITE_JOLTVEC32, false);
                }

                cb.write(linVel, BUFFER_WRITE_JOLTVEC32, false);
                cb.write(isSupported, BUFFER_WRITE_BOOL, false);
                cb.write(state, BUFFER_WRITE_UINT8, false);

                if (isSupported) {
                    const groundID = char.GetGroundBodyID();
                    const bodyLockInterface = this._physicsSystem.GetBodyLockInterface();
                    let bodyGround = bodyLockInterface.TryGetBody(groundID);
                    if (Jolt.getPointer(bodyGround) === 0) {
                        bodyGround = null;
                    }
                    cb.write(!!bodyGround, BUFFER_WRITE_BOOL, false);
                    if (bodyGround) {
                        const groundIdx = tracker.getPCID(Jolt.getPointer(bodyGround));
                        cb.write(groundIdx, BUFFER_WRITE_UINT32, false);
                    }

                    cb.write(isTooSteep, BUFFER_WRITE_BOOL, false);
                    cb.write(groundVelocity, BUFFER_WRITE_JOLTVEC32, false);
                    cb.write(groundNormal, BUFFER_WRITE_JOLTVEC32, false);
                }
            });
        } catch (e) {
            Debug.dev && Debug.error(e);
            return false;
        }

        return true;
    }

    _send() {
        const dispatcher = this._dispatcher;
        const msg = this._responseMessage;
        const outBuffer = this._outBuffer;
        const buffer = outBuffer.buffer;
        const drawer = this._drawer;
        const debugDraw = !!(drawer && drawer.dirty);

        outBuffer.reset();
        this._querier.reset();
        this._listener.reset();

        if (debugDraw) {
            msg.drawViews = drawer.data;
        } else {
            msg.drawViews = null;
        }

        msg.buffer = buffer;
        msg.steps = this._steps;

        if (Debug.dev) {
            msg.perfIndex = this._perfIndex;
            msg.time = performance.now() - this._stepTime;
        }

        if (debugDraw) {
            dispatcher.respond(msg, [ buffer, ...drawer.buffers ]);
            drawer.reset();
        } else {
            dispatcher.respond(msg, [ buffer ]);
        }

        return true;
    }

    _filterToBits(config) {
        const filterLayers = this._filterLayers;
        const pairs = config.layerPairs;
        for (let i = 0, end = pairs.length; i < end; i++) {
            const pair = pairs[i];
            pair[0] = this.getBitValue(pair[0]);
            pair[1] = this.getBitValue(pair[1]);
        }

        const layers = [];
        filterLayers.forEach(key => {
            layers.push(key);
        });

        config.layers = layers;
    }

    _exposeConstants() {
        const dispatcher = this._dispatcher;
        const msg = this._responseMessage;

        msg.constants = [
            'JOLT_VERSION', joltInfo.version,

            'JOLT_MOTION_TYPE_STATIC', Jolt.EMotionType_Static,
            'JOLT_MOTION_TYPE_DYNAMIC', Jolt.EMotionType_Dynamic,
            'JOLT_MOTION_TYPE_KINEMATIC', Jolt.EMotionType_Kinematic,

            'JOLT_OMP_CALCULATE_INERTIA', Jolt.EOverrideMassProperties_CalculateInertia,
            'JOLT_OMP_CALCULATE_MASS_AND_INERTIA', Jolt.EOverrideMassProperties_CalculateMassAndInertia,
            'JOLT_OMP_MASS_AND_INERTIA_PROVIDED', Jolt.EOverrideMassProperties_MassAndInertiaProvided,

            'JOLT_ALLOWED_DOFS_TRANSLATION_X', Jolt.EAllowedDOFs_TranslationX,
            'JOLT_ALLOWED_DOFS_TRANSLATION_Y', Jolt.EAllowedDOFs_TranslationY,
            'JOLT_ALLOWED_DOFS_TRANSLATION_Z', Jolt.EAllowedDOFs_TranslationZ,
            'JOLT_ALLOWED_DOFS_ROTATION_X', Jolt.EAllowedDOFs_RotationX,
            'JOLT_ALLOWED_DOFS_ROTATION_Y', Jolt.EAllowedDOFs_RotationY,
            'JOLT_ALLOWED_DOFS_ROTATION_Z', Jolt.EAllowedDOFs_RotationZ,
            'JOLT_ALLOWED_DOFS_PLANE_2D', Jolt.EAllowedDOFs_Plane2D,
            'JOLT_ALLOWED_DOFS_ALL', Jolt.EAllowedDOFs_All,

            'JOLT_MOTION_QUALITY_DISCRETE', Jolt.EMotionQuality_Discrete,
            'JOLT_MOTION_QUALITY_LINEAR_CAST', Jolt.EMotionQuality_LinearCast,

            'JOLT_BFM_IGNORE_BACK_FACES', Jolt.EBackFaceMode_IgnoreBackFaces,
            'JOLT_BFM_COLLIDE_BACK_FACES', Jolt.EBackFaceMode_CollideWithBackFaces,
            
            'JOLT_GROUND_STATE_ON_GROUND', Jolt.EGroundState_OnGround,
            'JOLT_GROUND_STATE_ON_STEEP_GROUND', Jolt.EGroundState_OnSteepGround,
            'JOLT_GROUND_STATE_NOT_SUPPORTED', Jolt.EGroundState_NotSupported,
            'JOLT_GROUND_STATE_IN_AIR', Jolt.EGroundState_InAir,

            'JOLT_TRANSMISSION_AUTO', Jolt.ETransmissionMode_Auto,
            'JOLT_TRANSMISSION_MANUAL', Jolt.ETransmissionMode_Manual,

            'JOLT_SPRING_MODE_FREQUENCY', Jolt.ESpringMode_FrequencyAndDamping,
            'JOLT_SPRING_MODE_STIFFNESS', Jolt.ESpringMode_StiffnessAndDamping,
        ];

        dispatcher.respond(msg);

        msg.constants = null;
    }
}

export { JoltBackend };
