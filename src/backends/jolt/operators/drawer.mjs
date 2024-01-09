import { FLOAT32_SIZE } from "../../../physics/components/jolt/constants.mjs";
import { Debug } from "../../../physics/debug.mjs";

class Drawer {
    constructor() {
        this._joltAabb = Jolt.AABox.prototype.sBiggest();
        this._joltQuat = Jolt.Quat.prototype.sIdentity();
        this._scale = new Jolt.Vec3(1, 1, 1);
        this._data = [];
        this._buffers = [];
        this._contexts = [];
    }

    get data() {
        return this._data;
    }

    get buffers() {
        return this._buffers;
    }

    get dirty() {
        return this._data.length > 0;
    }

    write(tracker) {
        const debugBodies = tracker.debug;

        if (debugBodies.size === 0) {
            return true;
        }

        let ok = true;
        debugBodies.forEach(body => {
            ok = ok && this._writeShape(body, tracker);
        });

        return ok;
    }

    reset() {
        this._data.length = 0;
        this._buffers.length = 0;
    }

    destroy() {
        this.reset();

        Jolt.destroy(this._joltAabb);
        this._joltAabb = null;

        Jolt.destroy(this._joltQuat);
        this._joltQuat = null;

        Jolt.destroy(this._scale);
        this._scale = null;
    }

    _writeShape(body, tracker) {
        try {
            const motionType = body.isCharacter ? Jolt.EMotionType_Kinematic : body.GetMotionType();

            if (body.debugDrawData) {
                const buffer = Jolt.HEAPF32.buffer;

                this._data.push(...body.debugDrawData, motionType, buffer);
                this._buffers.push(buffer);

                return true;
            }

            const shape = body.GetShape();
            const index = tracker.getPCID(Jolt.getPointer(body));
            const center = shape.GetCenterOfMass();
            const triContext = new Jolt.ShapeGetTriangles(shape, this._joltAabb, center, this._joltQuat, this._scale);
            const byteOffset = triContext.GetVerticesData();
            const length = triContext.GetVerticesSize() / FLOAT32_SIZE;
            const buffer = Jolt.HEAPF32.buffer;

            body.debugDrawData = [index, byteOffset, length];
            body.triContext = triContext;

            this._data.push(index, byteOffset, length, motionType, buffer);
            this._buffers.push(buffer);

        } catch (e) {
            Debug.dev && Debug.error(e);
            return false;
        }

        return true;
    }

    get views() {
        return this._views;
    }
}

export { Drawer };