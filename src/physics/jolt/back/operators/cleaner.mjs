import { Debug } from '../../debug.mjs';
import {
    BUFFER_READ_UINT32, CMD_DESTROY_BODY, CMD_DESTROY_CONSTRAINT, CMD_DESTROY_SHAPE
} from '../../constants.mjs';

class Cleaner {
    static cleanDebugDrawData(body, Jolt) {
        if (body.debugDrawData) {
            Jolt.destroy(body.triContext);
            body.triContext = null;
            body.debugDrawData = null;
        }
    }

    constructor(backend) {
        this._backend = backend;
    }

    clean() {
        const cb = this._backend.inBuffer;
        const command = cb.readCommand();
        let ok = true;

        switch (command) {
            case CMD_DESTROY_BODY:
                ok = this._destroyBody(cb);
                break;

            case CMD_DESTROY_SHAPE:
                ok = this._destroyShape(cb);
                break;

            case CMD_DESTROY_CONSTRAINT:
                ok = this._destroyConstraint(cb);
                break;
        }

        return ok;
    }

    immediateClean(cb) {
        const command = cb.readCommand();

        if (command === CMD_DESTROY_SHAPE) {
            return this._destroyShape(cb);
        }

        if ($_DEBUG) {
            Debug.warn('Command not recognized.');
        }

        return null;
    }

    destroy() {
        this._backend = null;
    }

    destroyBody(body) {
        const backend = this._backend;
        const Jolt = backend.Jolt;
        const tracker = backend.tracker;
        const bodyInterface = backend.bodyInterface;
        const physicsSystem = backend.physicsSystem;

        Cleaner.cleanDebugDrawData(body, Jolt);

        tracker.stopTrackingBody(body);

        if (body.motionState) {
            body.motionState = null;
        }

        const constraints = body.constraints;
        if (constraints) {
            const constraintMap = tracker.constraintMap;
            for (let i = constraints.length; i > 0; i--) {
                const index = constraints.pop();
                const data = constraintMap.get(index);
                const constraint = data.constraint;
                const listener = constraint.listener; // vehicle

                const b1constraints = data.body1?.constraints;
                const b2constraints = data.body2?.constraints;

                if (b1constraints && b1constraints !== constraints) {
                    const idx = b1constraints.findIndex(key => key === index);
                    if (idx >= 0) b1constraints.splice(idx, 1);
                } else if (b2constraints) {
                    const idx = b2constraints.findIndex(key => key === index);
                    if (idx >= 0) b2constraints.splice(idx, 1);
                }

                constraintMap.delete(index);
                if (listener && Jolt.getPointer(listener) !== 0) {
                    physicsSystem.RemoveStepListener(listener);
                    Jolt.destroy(listener);
                    constraint.listener = null;
                }
                if (Jolt.getPointer(constraint) !== 0) {
                    physicsSystem.RemoveConstraint(constraint);
                }
            }
            body.constraints = null;

            body.linked?.forEach((linkedBody) => {
                if (Jolt.getPointer(linkedBody) !== 0) {
                    bodyInterface.ActivateBody(linkedBody.GetID());
                }
                linkedBody.linked.delete(body);
            });
            body.linked = null;
        }

        if (body.isCharacter) {
            if (body.bodyFilter) {
                // body filter for paired body
                Jolt.destroy(body.bodyFilter);
            }

            if (body.bpFilter) {
                Jolt.destroy(body.bpFilter);
            }

            if (body.objFilter) {
                Jolt.destroy(body.objFilter);
            }

            Jolt.destroy(body.updateSettings);
            Jolt.destroy(body);
        } else {
            const id = body.GetID();
            bodyInterface.RemoveBody(id);
            bodyInterface.DestroyBody(id);
        }

        return true;
    }

    _destroyBody(cb) {
        const index = cb.read(BUFFER_READ_UINT32);
        const body = this._backend.tracker.getBodyByPCID(index);

        if (!body) {
            // Body could have been destroyed already. For example:
            // Disable parent, then manually disable child. The body
            // would get destroyed when parent was disabled. The
            // command for destroy would be issued again, when child is
            // disabled.
            return true;
        }

        return this.destroyBody(body);
    }

    _destroyConstraint(cb) {
        const backend = this._backend;
        const tracker = backend.tracker;
        const bodyInterface = backend.bodyInterface;
        const Jolt = backend.Jolt;
        const map = tracker.constraintMap;

        const index = cb.read(BUFFER_READ_UINT32);
        const data = map.get(index);
        if (!data) {
            return true;
        }

        const { constraint, body1, body2 } = data;

        const clearIndex = (list) => {
            const idx = list?.findIndex(e => e === index);
            if (idx >= 0) {
                list.splice(idx, 1);
            }
        };

        const activate = (body) => {
            if (Jolt.getPointer(body) !== 0) {
                bodyInterface.ActivateBody(body.GetID());
            }
        };

        clearIndex(body1.constraints);
        activate(body1);

        // Vehicle constraint has no body2
        if (body2) {
            clearIndex(body2.constraints);
            activate(body2);
        }

        if (Jolt.getPointer(constraint) !== 0) {
            backend.physicsSystem.RemoveConstraint(constraint);
        }
        map.delete(index);

        return true;
    }

    _destroyShape(cb) {
        const backend = this._backend;
        const tracker = backend.tracker;
        const shapeNumber = cb.read(BUFFER_READ_UINT32);
        const shape = tracker.shapeMap.get(shapeNumber);

        if ($_DEBUG && !shape) {
            Debug.warn('Trying to destroy a shape that has already been destroyed');
            return false;
        }

        shape.Release();

        tracker.shapeMap.delete(shapeNumber);

        return true;
    }
}

export { Cleaner };
