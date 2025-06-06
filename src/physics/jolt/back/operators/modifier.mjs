import { Debug } from '../../debug.mjs';
import { MotionState } from '../motion-state.mjs';
import { ConstraintModifier } from './helpers/constraint-modifier.mjs';
import {
    BUFFER_READ_BOOL, BUFFER_READ_FLOAT32, BUFFER_READ_INT32, BUFFER_READ_UINT16,
    BUFFER_READ_UINT32, BUFFER_READ_UINT8, CMD_ADD_ANGULAR_IMPULSE, CMD_ADD_FORCE, CMD_ADD_IMPULSE,
    CMD_ADD_TORQUE, CMD_APPLY_BUOYANCY_IMPULSE, CMD_CHANGE_GRAVITY, CMD_CLAMP_ANG_VEL,
    CMD_CLAMP_LIN_VEL, CMD_MODIFY_SHAPE, CMD_MOVE_BODY, CMD_MOVE_KINEMATIC, CMD_REMOVE_SHAPE,
    CMD_SET_ALLOW_SLEEPING, CMD_SET_ANG_FACTOR, CMD_SET_ANG_VEL, CMD_SET_ANG_VEL_CLAMPED,
    CMD_SET_APPLY_GYRO_FORCE, CMD_SET_AUTO_UPDATE_ISOMETRY, CMD_SET_COL_GROUP, CMD_SET_DEBUG_DRAW,
    CMD_SET_DEBUG_DRAW_DEPTH, CMD_SET_DOF, CMD_SET_FRICTION, CMD_SET_GRAVITY_FACTOR,
    CMD_SET_INTERNAL_EDGE, CMD_SET_IS_SENSOR, CMD_SET_KIN_COL_NON_DYN, CMD_SET_LIN_VEL,
    CMD_SET_LIN_VEL_CLAMPED, CMD_SET_MAX_ANG_VEL, CMD_SET_MAX_LIN_VEL, CMD_SET_MOTION_QUALITY,
    CMD_SET_MOTION_TYPE, CMD_SET_OBJ_LAYER, CMD_SET_POS_STEPS, CMD_SET_RESTITUTION, CMD_SET_SHAPE,
    CMD_SET_VEL_STEPS, CMD_TOGGLE_GROUP_PAIR, CMD_UPDATE_BIT_FILTER, CMD_USE_MOTION_STATE,
    MOTION_TYPE_DYNAMIC, MOTION_TYPE_KINEMATIC, CMD_ADD_SHAPE, UINT32_SIZE, UINT8_SIZE,
    CMD_RESET_MOTION, CMD_RESET_SLEEP_TIMER, FLOAT32_SIZE, MOTION_QUALITY_DISCRETE,
    CMD_SET_CUSTOM_SHAPE
} from '../../constants.mjs';
import { Creator } from './creator.mjs';
import { Cleaner } from './cleaner.mjs';
import { CharModifier } from './helpers/char-modifier.mjs';

class Modifier {
    constructor(backend) {
        this._backend = backend;

        const Jolt = backend.Jolt;

        this._joltVec3_1 = new Jolt.Vec3();
        this._joltVec3_2 = new Jolt.Vec3();
        this._joltVec3_3 = new Jolt.Vec3();
        this._joltVec3_4 = new Jolt.Vec3();
        this._joltQuat_1 = new Jolt.Quat();

        this._constraintModifier = new ConstraintModifier(this);
        this._charModifier = new CharModifier(this);
        // TODO
        // add modifier helpers for other components as well
    }

    get joltVec3_1() {
        return this._joltVec3_1;
    }

    get joltVec3_2() {
        return this._joltVec3_2;
    }

    get joltVec3_3() {
        return this._joltVec3_3;
    }

    get joltVec3_4() {
        return this._joltVec3_4;
    }

    get joltQuat() {
        return this._joltQuat_1;
    }

    get backend() {
        return this._backend;
    }

    modify(meshBuffers) {
        const cb = this._backend.inBuffer;
        const command = cb.readCommand();
        let ok = true;

        if (command >= 400 && command < 500) {
            return this._charModifier.modify(command, cb);
        } else if (command >= 500 && command < 600) {
            return this._constraintModifier.modify(command, cb);
        }

        // TODO
        // refactor

        switch (command) {
            case CMD_CHANGE_GRAVITY:
                ok = this._changeGravity(cb);
                break;

            case CMD_ADD_FORCE:
                ok = this._applyForces(cb, 'AddForce');
                break;

            case CMD_ADD_IMPULSE:
                ok = this._applyForces(cb, 'AddImpulse');
                break;

            case CMD_ADD_ANGULAR_IMPULSE:
                ok = this._applyForces(cb, 'AddAngularImpulse', true);
                break;

            case CMD_APPLY_BUOYANCY_IMPULSE:
                ok = this._applyBuoyancyImpulse(cb);
                break;

            case CMD_ADD_TORQUE:
                ok = this._applyForces(cb, 'AddTorque', true);
                break;

            case CMD_MOVE_BODY:
                ok = this._moveBody(cb);
                break;

            case CMD_MOVE_KINEMATIC:
                ok = this._moveKinematic(cb);
                break;

            case CMD_SET_LIN_VEL:
                ok = this._applyForces(cb, 'SetLinearVelocity', true);
                break;

            case CMD_SET_ANG_VEL:
                ok = this._applyForces(cb, 'SetAngularVelocity', true);
                break;

            case CMD_RESET_MOTION:
                ok = this._resetMotion(cb);
                break;

            case CMD_SET_MOTION_TYPE:
                ok = this._setMotionType(cb);
                break;

            case CMD_SET_OBJ_LAYER:
                ok = this._setObjectLayer(cb);
                break;

            case CMD_TOGGLE_GROUP_PAIR:
                ok = this._toggleGroupPair(cb);
                break;

            case CMD_USE_MOTION_STATE:
                ok = this._useMotionState(cb);
                break;

            case CMD_SET_GRAVITY_FACTOR:
                ok = this._setGravityFactor(cb);
                break;

            case CMD_SET_DOF:
                ok = this._setDOF(cb);
                break;

            case CMD_SET_MOTION_QUALITY:
                ok = this._setMotionQuality(cb);
                break;

            case CMD_SET_AUTO_UPDATE_ISOMETRY:
                ok = this._setAutoUpdateIsometry(cb);
                break;

            case CMD_SET_SHAPE:
                ok = this._setShape(cb, meshBuffers);
                break;

            case CMD_SET_CUSTOM_SHAPE:
                ok = this._setCustomShape(cb);
                break;

            case CMD_ADD_SHAPE:
                ok = this._addShape(cb);
                break;

            case CMD_REMOVE_SHAPE:
                ok = this._removeShape(cb);
                break;

            case CMD_MODIFY_SHAPE:
                ok = this._modifyShape(cb);
                break;

            case CMD_SET_DEBUG_DRAW:
                ok = this._setDebugDraw(cb);
                break;

            case CMD_SET_DEBUG_DRAW_DEPTH:
                ok = this._setDebugDrawDepth(cb);
                break;

            case CMD_SET_ALLOW_SLEEPING:
                ok = this._setAllowSleeping(cb);
                break;

            case CMD_SET_ANG_FACTOR:
                ok = this._setAngularFactor(cb);
                break;

            case CMD_SET_COL_GROUP:
                ok = this._setCollisionGroup(cb);
                break;

            case CMD_SET_FRICTION:
                ok = this._setFriction(cb);
                break;

            case CMD_SET_IS_SENSOR:
                ok = this._setIsSensor(cb);
                break;

            case CMD_SET_RESTITUTION:
                ok = this._setRestitution(cb);
                break;

            case CMD_SET_KIN_COL_NON_DYN:
                ok = this._setKinematicCollideNonDynamic(cb);
                break;

            case CMD_SET_APPLY_GYRO_FORCE:
                ok = this._setApplyGyroForce(cb);
                break;

            case CMD_SET_INTERNAL_EDGE:
                ok = this._setInternalEdge(cb);
                break;

            case CMD_RESET_SLEEP_TIMER:
                ok = this._resetSleepTimer(cb);
                break;

            case CMD_SET_LIN_VEL_CLAMPED:
                ok = this._applyForces(cb, 'SetLinearVelocityClamped', true);
                break;

            case CMD_SET_ANG_VEL_CLAMPED:
                ok = this._applyForces(cb, 'SetAngularVelocityClamped', true);
                break;

            case CMD_SET_MAX_ANG_VEL:
                ok = this._setMaxAngVel(cb);
                break;

            case CMD_SET_MAX_LIN_VEL:
                ok = this._setMaxLinVel(cb);
                break;

            case CMD_CLAMP_LIN_VEL:
                ok = this._clampLinVel(cb);
                break;

            case CMD_CLAMP_ANG_VEL:
                ok = this._clampAngVel(cb);
                break;

            case CMD_SET_VEL_STEPS:
                ok = this._setVelSteps(cb);
                break;

            case CMD_SET_POS_STEPS:
                ok = this._setPosSteps(cb);
                break;

            case CMD_UPDATE_BIT_FILTER:
                ok = this._updateGroupMask(cb);
                break;
        }

        return ok;
    }

    immediateModify(cb) {
        const command = cb.readCommand();

        if (command === CMD_TOGGLE_GROUP_PAIR) {
            this._toggleGroupPair(cb);
        } else if ($_DEBUG) {
            Debug.warn('Command not recognized');
        }
    }

    destroy() {
        const Jolt = this._backend.Jolt;

        Jolt.destroy(this._joltVec3_1);
        Jolt.destroy(this._joltVec3_2);
        Jolt.destroy(this._joltVec3_3);
        Jolt.destroy(this._joltVec3_4);
        Jolt.destroy(this._joltQuat_1);

        this._joltVec3_1 = null;
        this._joltVec3_2 = null;
        this._joltVec3_3 = null;
        this._joltQuat_1 = null;
    }

    _changeGravity(cb) {
        const jv = this._joltVec3_1;

        jv.FromBuffer(cb);

        try {
            this._backend.physicsSystem.SetGravity(jv);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _applyForces(cb, method, oneAttr = false) {
        const jv1 = this._joltVec3_1;
        const jv2 = this._joltVec3_2;

        const body = this._getBody(cb);

        // TODO skip if no body

        try {
            jv1.FromBuffer(cb);
            if (oneAttr) {
                body[method](jv1);
            } else {
                if (cb.flag) {
                    jv2.FromBuffer(cb);
                    body[method](jv1, jv2);
                } else {
                    body[method](jv1);
                }
            }
            this._backend.bodyInterface.ActivateBody(body.GetID());
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setShape(cb, meshBuffers) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const body = this._getBody(cb);

        // TODO skip if no body

        try {
            const shapeSettings = Creator.createShapeSettings(cb, meshBuffers, Jolt,
                this._joltVec3_1, this._joltQuat_1);
            if (!shapeSettings) {
                return false;
            }

            const shapeResult = shapeSettings.Create();
            if ($_DEBUG && shapeResult.HasError()) {
                Debug.error(`Failed to create shape: ${shapeResult.GetError().c_str()}`);
                return false;
            }

            const shape = shapeResult.Get();
            const currentShape = body.GetShape();

            backend.bodyInterface.SetShape(body.GetID(), shape, false /* inUpdateMassProperties */,
                Jolt.EActivation_Activate);
            currentShape.Release();

            // If there is debug draw context, we need to reset it to view a new shape
            Cleaner.cleanDebugDrawData(body, Jolt);

        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setCustomShape(cb) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const body = this._getBody(cb);

        // TODO skip if no body

        try {
            const shapeIndex = cb.read(BUFFER_READ_UINT32);
            const shape = backend.tracker.shapeMap.get(shapeIndex);
            if ($_DEBUG) {
                const ok = Debug.assert(!!shape, `Unable to locate shape: ${shapeIndex}`);
                if (!ok) {
                    return false;
                }
            }

            const currentShape = body.GetShape();

            backend.bodyInterface.SetShape(body.GetID(), shape, false /* inUpdateMassProperties */,
                Jolt.EActivation_Activate);
            currentShape.Release();

            // If there is debug draw context, we need to reset it to view a new shape
            Cleaner.cleanDebugDrawData(body, Jolt);

        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _addShape(cb) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const body = this._getBody(cb);

        if (!body) {
            cb.skip(7 * FLOAT32_SIZE + 2 * UINT32_SIZE);
            return true;
        }

        const jv = this._joltVec3_1;
        const jq = this._joltQuat_1;

        try {
            const shapeIndex = cb.read(BUFFER_READ_UINT32);
            const shape = backend.tracker.shapeMap.get(shapeIndex);
            if ($_DEBUG) {
                const ok = Debug.assert(!!shape, `Unable to locate shape: ${shapeIndex}`);
                if (!ok) {
                    return false;
                }
            }

            jv.FromBuffer(cb);
            jq.FromBuffer(cb);

            const userData = cb.read(BUFFER_READ_UINT32);
            const bodyShape = body.GetShape();

            if ($_DEBUG) {
                const isValid = bodyShape.GetType() === Jolt.EShapeType_Compound &&
                    bodyShape.GetSubType() === Jolt.EShapeSubType_MutableCompound;
                if (!isValid) {
                    Debug.warn('Current shape does not support adding child shapes.');
                    return false;
                }
            }

            const com = bodyShape.GetCenterOfMass();
            const compoundShape = Jolt.castObject(bodyShape, Jolt.MutableCompoundShape);
            compoundShape.AddShape(jv, jq, shape, userData);
            compoundShape.AdjustCenterOfMass();
            backend.bodyInterface.NotifyShapeChanged(body.GetID(), com, true, Jolt.EActivation_Activate);

            // If there is debug draw context, we need to reset it to view a new shape
            Cleaner.cleanDebugDrawData(body, Jolt);

        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _removeShape(cb) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const body = this._getBody(cb);

        const childIndex = cb.read(BUFFER_READ_UINT32);

        if (!body) {
            return true;
        }

        try {
            const bodyShape = body.GetShape();
            const compoundShape = Jolt.castObject(bodyShape, Jolt.MutableCompoundShape);

            if ($_DEBUG) {
                const isValid = bodyShape.GetType() === Jolt.EShapeType_Compound &&
                    bodyShape.GetSubType() === Jolt.EShapeSubType_MutableCompound;
                if (!isValid) {
                    Debug.warn('Current shape does not support adding child shapes.');
                    return false;
                }
            }

            const childShapesCount = compoundShape.GetNumSubShapes();
            if (childIndex > childShapesCount - 1) {
                if ($_DEBUG) {
                    Debug.warn('Trying to remove invalid child shape. Index exceeds number of child shapes.');
                }
                return true;
            }

            const shape = compoundShape.GetSubShape(childIndex);
            const com = bodyShape.GetCenterOfMass();
            compoundShape.RemoveShape(childIndex);
            compoundShape.AdjustCenterOfMass();
            backend.bodyInterface.NotifyShapeChanged(body.GetID(), com, true, Jolt.EActivation_Activate);

            // release, if the child shape was created by user via creator
            if (shape.needsRelease) {
                shape.Release();
            }

            Cleaner.cleanDebugDrawData(body, Jolt);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _modifyShape(cb) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const body = this._getBody(cb);

        if (!body) {
            cb.skip(7 * FLOAT32_SIZE + UINT8_SIZE + 2 * UINT32_SIZE);
            return true;
        }

        const jv = this._joltVec3_1;
        const jq = this._joltQuat_1;

        try {
            const childIndex = cb.read(BUFFER_READ_UINT32);

            jv.FromBuffer(cb);
            jq.FromBuffer(cb);

            const bodyShape = body.GetShape();

            if ($_DEBUG) {
                const isValid = bodyShape.GetType() === Jolt.EShapeType_Compound &&
                    bodyShape.GetSubType() === Jolt.EShapeSubType_MutableCompound;
                if (!isValid) {
                    Debug.warn('Current shape does not support adding child shapes.');
                    return false;
                }
            }

            let shape;
            if (cb.flag) {
                const shapeIndex = cb.read(BUFFER_READ_UINT32);
                shape = backend.tracker.shapeMap.get(shapeIndex);
                if ($_DEBUG) {
                    const ok = Debug.assert(!!shape, `Unable to locate shape: ${shapeIndex}`);
                    if (!ok) {
                        return false;
                    }
                }
            }

            const com = bodyShape.GetCenterOfMass();
            const compoundShape = Jolt.castObject(bodyShape, Jolt.MutableCompoundShape);

            let existingShape;
            if (shape) {
                existingShape = compoundShape.GetSubShape(childIndex);
            }

            compoundShape.ModifyShape(childIndex, jv, jq, shape);
            compoundShape.AdjustCenterOfMass();
            backend.bodyInterface.NotifyShapeChanged(body.GetID(), com, true, Jolt.EActivation_Activate);

            if (existingShape?.needsRelease) {
                existingShape.Release();
            }

            // If there is debug draw context, we need to reset it to view a new shape
            Cleaner.cleanDebugDrawData(body, Jolt);

        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _useMotionState(cb) {
        const body = this._getBody(cb);
        const useMotionState = cb.read(BUFFER_READ_BOOL);

        if (!body || !this._backend.config.useMotionStates) {
            return true;
        }

        if (!body.motionState && useMotionState) {
            body.motionState = new MotionState(body);
        } else if (body.motionState && !useMotionState) {
            body.motionState = null;
        }

        return true;
    }

    _applyBuoyancyImpulse(cb) {
        const backend = this._backend;
        const body = this._getBody(cb);
        const jv1 = this._joltVec3_1;
        const jv2 = this._joltVec3_2;
        const jv3 = this._joltVec3_3;

        try {
            const waterSurfacePosition = jv1.FromBuffer(cb);
            const surfaceNormal = jv2.FromBuffer(cb);
            const buoyancy = cb.read(BUFFER_READ_FLOAT32);
            const linearDrag = cb.read(BUFFER_READ_FLOAT32);
            const angularDrag = cb.read(BUFFER_READ_FLOAT32);
            const fluidVelocity = jv3.FromBuffer(cb);

            if (!body) {
                return true;
            }

            const deltaTime = backend.config.fixedStep;
            const gravity = backend.physicsSystem.GetGravity();

            body.ApplyBuoyancyImpulse(waterSurfacePosition, surfaceNormal, buoyancy, linearDrag, angularDrag, fluidVelocity, gravity, deltaTime);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _resetMotion(cb) {
        const body = this._getBody(cb);

        if (!body) {
            return true;
        }

        try {
            body.ResetMotion();
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _moveBody(cb) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const jv = this._joltVec3_1;
        const jq = this._joltQuat_1;
        const body = this._getBody(cb);

        try {
            jv.FromBuffer(cb);
            jq.FromBuffer(cb);

            if (!body) {
                return true;
            }

            if ($_DEBUG) {
                const type = body.GetMotionType();
                if (type === Jolt.EMotionType_Dynamic || type === Jolt.EMotionType_Kinematic) {
                    backend.bodyInterface.SetPositionAndRotation(body.GetID(), jv, jq, Jolt.EActivation_Activate);
                } else {
                    Debug.warnOnce('Trying to move a static body.');
                }
            } else {
                backend.bodyInterface.SetPositionAndRotation(body.GetID(), jv, jq, Jolt.EActivation_Activate);
            }

            const ms = body.motionState;
            if (ms) {
                ms.updatePosition();
                ms.updateRotation();
            }
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _moveKinematic(cb) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const jv = this._joltVec3_1;
        const jq = this._joltQuat_1;
        const body = this._getBody(cb);

        try {
            jv.FromBuffer(cb);
            jq.FromBuffer(cb);

            const dt = cb.read(BUFFER_READ_FLOAT32) || backend.config.fixedStep;

            if (!body) {
                return true;
            }

            if ($_DEBUG) {
                const type = body.GetMotionType();
                if (type === Jolt.EMotionType_Dynamic || type === Jolt.EMotionType_Kinematic) {
                    backend.bodyInterface.MoveKinematic(body.GetID(), jv, jq, dt);
                } else {
                    Debug.warnOnce('Trying to move a static body.');
                }
            } else {
                backend.bodyInterface.SetPositionAndRotation(body.GetID(), jv, jq, dt);
            }
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _toggleGroupPair(cb) {
        const backend = this._backend;
        const enable = cb.read(BUFFER_READ_BOOL);
        const group = cb.read(BUFFER_READ_UINT16);
        const subGroup1 = cb.read(BUFFER_READ_UINT16);
        const subGroup2 = cb.read(BUFFER_READ_UINT16);

        try {
            const filter = backend.groupFilterTables[group];

            if ($_DEBUG) {
                let ok = true;
                ok = ok && Debug.assert(!!filter, `Unable to locate filter group: ${group}`);
                ok = ok && Debug.assert(subGroup1 <= filter.maxIndex, `Sub group number is over the filter table size: ${subGroup1}`);
                ok = ok && Debug.assert(subGroup2 <= filter.maxIndex, `Sub group number is over the filter table size: ${subGroup2}`);
                if (!ok) return false;
            }

            if (enable) {
                filter.EnableCollision(subGroup1, subGroup2);
            } else {
                filter.DisableCollision(subGroup1, subGroup2);
            }
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setMotionType(cb) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const tracker = backend.tracker;
        const bodyInterface = backend.bodyInterface;
        const index = cb.read(BUFFER_READ_UINT32);
        const body = backend.tracker.getBodyByPCID(index);
        const type = cb.read(BUFFER_READ_UINT8);

        // TODO
        // skip bytes instead of reading
        if (!body) {
            return true;
        }

        let jType = Jolt.EMotionType_Static;
        if (type === MOTION_TYPE_DYNAMIC) {
            jType = Jolt.EMotionType_Dynamic;
        } else if (type === MOTION_TYPE_KINEMATIC) {
            jType = Jolt.EMotionType_Kinematic;
        }

        try {
            bodyInterface.SetMotionType(body.GetID(), jType, Jolt.EActivation_Activate);
            tracker.update(body, index);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setObjectLayer(cb) {
        const body = this._getBody(cb);
        const layer = cb.read(BUFFER_READ_UINT32);

        if (!body) {
            return true;
        }

        const backend = this._backend;

        try {
            backend.bodyInterface.SetObjectLayer(body.GetID(), layer);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setGravityFactor(cb) {
        const body = this._getBody(cb);
        const factor = cb.read(BUFFER_READ_FLOAT32);

        if (!body) {
            return true;
        }

        const backend = this._backend;

        try {
            backend.bodyInterface.SetGravityFactor(body.GetID(), factor);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setDOF(cb) {
        const body = this._getBody(cb);
        const allowedDOFs = cb.read(BUFFER_READ_UINT8);

        if (!body) {
            return true;
        }

        try {
            const motionProperties = body.GetMotionProperties();
            const massProperties = body.GetBodyCreationSettings().GetMassProperties();
            motionProperties.SetMassProperties(allowedDOFs, massProperties);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setMotionQuality(cb) {
        const body = this._getBody(cb);
        const quality = cb.read(BUFFER_READ_UINT8);

        if (!body) {
            return true;
        }

        const backend = this._backend;
        const Jolt = backend.Jolt;
        const jQuality = quality === MOTION_QUALITY_DISCRETE ?
            Jolt.EMotionQuality_Discrete : Jolt.EMotionQuality_LinearCast;

        try {
            backend.bodyInterface.SetMotionQuality(body.GetID(), jQuality);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setAutoUpdateIsometry(cb) {
        const body = this._getBody(cb);
        const type = cb.read(BUFFER_READ_UINT8);

        if (!body) {
            return true;
        }

        body.isometryUpdate = type;

        return true;
    }

    _setDebugDraw(cb) {
        const body = this._getBody(cb);
        const toDraw = cb.read(BUFFER_READ_BOOL);

        if (!body) {
            return true;
        }

        const debugBodies = this._backend.tracker.debug;

        try {
            if (toDraw) {
                debugBodies.add(body);
            } else {
                Cleaner.cleanDebugDrawData(body, this._backend.Jolt);
                debugBodies.delete(body);
            }
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setDebugDrawDepth(cb) {
        const body = this._getBody(cb);
        const bool = cb.read(BUFFER_READ_BOOL);

        if (!body) {
            return true;
        }

        body.debugDrawDepth = bool;

        return true;
    }

    _setAllowSleeping(cb) {
        const body = this._getBody(cb);
        const bool = cb.read(BUFFER_READ_BOOL);

        if (!body) {
            return true;
        }

        try {
            body.SetAllowSleeping(bool);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setAngularFactor(cb) {
        const body = this._getBody(cb);
        const damping = cb.read(BUFFER_READ_FLOAT32);

        if (!body) {
            return true;
        }

        try {
            body.GetMotionProperties().SetAngularDamping(damping);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setCollisionGroup(cb) {
        const body = this._getBody(cb);
        const group = cb.read(BUFFER_READ_INT32);
        const subGroup = cb.read(BUFFER_READ_INT32);

        if (!body) {
            return true;
        }

        const cg = body.GetCollisionGroup();
        const table = this._backend.groupFilterTables[group];

        if ($_DEBUG) {
            let ok = Debug.assert(!!table,
                `Trying to set a filter group that does not exist: ${group}`);
            ok = ok && Debug.assert((subGroup <= table.maxIndex),
                `Trying to set sub group that is over the filter group table size: ${subGroup}`);
            if (!ok) {
                return false;
            }
        }

        try {
            cg.SetGroupFilter(table);
            cg.SetGroupID(group);
            cg.SetSubGroupID(subGroup);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setFriction(cb) {
        const body = this._getBody(cb);
        const friction = cb.read(BUFFER_READ_FLOAT32);

        if (!body) {
            return true;
        }

        try {
            body.SetFriction(friction);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setIsSensor(cb) {
        const body = this._getBody(cb);
        const bool = cb.read(BUFFER_READ_BOOL);

        if (!body) {
            return true;
        }

        try {
            body.SetIsSensor(bool);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setRestitution(cb) {
        const body = this._getBody(cb);
        const restitution = cb.read(BUFFER_READ_FLOAT32);

        if (!body) {
            return true;
        }

        try {
            body.SetRestitution(restitution);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setKinematicCollideNonDynamic(cb) {
        const body = this._getBody(cb);
        const bool = cb.read(BUFFER_READ_BOOL);

        if (!body) {
            return true;
        }

        try {
            body.SetCollideKinematicVsNonDynamic(bool);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setApplyGyroForce(cb) {
        const body = this._getBody(cb);
        const bool = cb.read(BUFFER_READ_BOOL);

        if (!body) {
            return true;
        }

        try {
            body.SetApplyGyroscopicForce(bool);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setInternalEdge(cb) {
        const body = this._getBody(cb);
        const bool = cb.read(BUFFER_READ_BOOL);

        if (!body) {
            return true;
        }

        try {
            body.SetEnhancedInternalEdgeRemoval(bool);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _resetSleepTimer(cb) {
        const body = this._getBody(cb);

        if (!body) {
            return true;
        }

        try {
            body.ResetSleepTimer();
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setMaxAngVel(cb) {
        const body = this._getBody(cb);
        const vel = cb.read(BUFFER_READ_FLOAT32);

        if (!body) {
            return true;
        }

        try {
            body.GetMotionProperties().SetMaxAngularVelocity(vel);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setMaxLinVel(cb) {
        const body = this._getBody(cb);
        const vel = cb.read(BUFFER_READ_FLOAT32);

        if (!body) {
            return true;
        }

        try {
            body.GetMotionProperties().SetMaxLinearVelocity(vel);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _clampLinVel(cb) {
        const body = this._getBody(cb);

        if (!body) {
            return true;
        }

        try {
            body.GetMotionProperties().ClampLinearVelocity();
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _clampAngVel(cb) {
        const body = this._getBody(cb);

        if (!body) {
            return true;
        }

        try {
            body.GetMotionProperties().ClampAngularVelocity();
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setVelSteps(cb) {
        const body = this._getBody(cb);
        const count = cb.read(BUFFER_READ_UINT32);

        if (!body) {
            return true;
        }

        try {
            body.GetMotionProperties().SetNumVelocityStepsOverride(count);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _setPosSteps(cb) {
        const body = this._getBody(cb);
        const count = cb.read(BUFFER_READ_UINT32);

        if (!body) {
            return true;
        }

        try {
            body.GetMotionProperties().SetNumPositionStepsOverride(count);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _updateGroupMask(cb) {
        const backend = this._backend;
        const body = this._getBody(cb);

        const group = cb.read(BUFFER_READ_UINT32);
        const mask = cb.read(BUFFER_READ_UINT32);

        if (!body) {
            return true;
        }

        try {
            const objectLayer = backend.Jolt.ObjectLayerPairFilterMask.prototype.sGetObjectLayer(group, mask);
            backend.bodyInterface.SetObjectLayer(body.GetID(), objectLayer);
        } catch (e) {
            if ($_DEBUG) {
                Debug.error(e);
            }
            return false;
        }

        return true;
    }

    _getBody(cb) {
        const index = cb.read(BUFFER_READ_UINT32);
        return this._backend.tracker.getBodyByPCID(index);
    }
}

export { Modifier };
