import { Vec3 } from 'playcanvas';
import { ShapeComponentSystem } from './shape/system.mjs';
import {
    BUFFER_READ_BOOL, BUFFER_READ_FLOAT32, BUFFER_READ_UINT16, BUFFER_READ_UINT32,
    BUFFER_READ_UINT8, CONTACT_TYPE_ADDED, CONTACT_TYPE_PERSISTED, CONTACT_TYPE_REMOVED, FLOAT32_SIZE, UINT8_SIZE
} from '../constants.mjs';
import { fromBuffer } from '../math.mjs';

const emptyResult = [];

/**
 * @import {Entity} from 'playcanvas'
 * @import {Vec3} from 'playcanvas'
 */

class ContactResult {
    constructor(entity, normal, depth, point = null, offset = null, points1 = null, points2 = null) {
        this.entity = entity;
        this.normal = normal;
        this.penetrationDepth = depth;
        if (point) this.point = point;
        if (offset) this.offset = offset;
        if (points1) this.points1 = points1;
        if (points2) this.points2 = points2;
    }
}

class CharContactResult {
    constructor(entity, contactPosition, contactNormal, contactVelocity, newCharVelocity) {
        this.entity = entity;
        this.contactPosition = contactPosition;
        this.contactNormal = contactNormal;
        this.contactVelocity = contactVelocity;
        this.newCharVelocity = newCharVelocity;
    }
}

/**
 * @interface
 * @param {Entity} entity - Entity that query has detected.
 * @param {Vec3} point - A point in world space where the contact was detected.
 * @param {number} fraction - A normalized fraction of the ray length.
 */
class CastResult {
    constructor(entity, point, fraction, normal) {
        this.entity = entity;
        this.point = point;
        this.fraction = fraction;
        if (normal) {
            this.normal = normal;
        }
    }
}

class CollideShapeResult {
    constructor(entity, point1, point2, axis, depth, normal) {
        this.entity = entity;
        this.point1 = point1;
        this.point2 = point2;
        this.axis = axis;
        this.depth = depth;
        if (normal) {
            this.normal = normal;
        }
    }
}

class ResponseHandler {
    static handleContact(cb, map) {
        const count = cb.read(BUFFER_READ_UINT32);

        for (let i = 0; i < count; i++) {
            const type = cb.read(BUFFER_READ_UINT8);
            const isValidBody1 = cb.read(BUFFER_READ_BOOL);
            const isValidBody2 = cb.read(BUFFER_READ_BOOL);

            let idx1 = null;
            if (isValidBody1) {
                idx1 = cb.read(BUFFER_READ_UINT32);
            }

            let idx2 = null;
            if (isValidBody2) {
                idx2 = cb.read(BUFFER_READ_UINT32);
            }

            const entity1 = map.get(idx1);
            const entity2 = map.get(idx2);

            switch (type) {
                case CONTACT_TYPE_ADDED: {
                    const normal = fromBuffer(cb);
                    const depth = cb.read(BUFFER_READ_FLOAT32);
                    const contactPoints = cb.read(BUFFER_READ_BOOL);
                    let point, points1, points2, offset;

                    if (contactPoints) {
                        const averaged = cb.read(BUFFER_READ_BOOL);

                        if (averaged) {
                            point = fromBuffer(cb);
                        } else {
                            offset = fromBuffer(cb);
                            const count1 = cb.read(BUFFER_READ_UINT32);
                            const count2 = cb.read(BUFFER_READ_UINT32);
                            points1 = [];
                            points2 = [];
                            for (let i = 0; i < count1; i++) {
                                points1.push(fromBuffer(cb));
                            }
                            for (let i = 0; i < count2; i++) {
                                points2.push(fromBuffer(cb));
                            }
                        }
                    }

                    const event = 'contact:added';
                    if (entity1?.hasEvent(event)) {
                        const contactResult = new ContactResult(entity2, normal, depth, point, offset, points1, points2);
                        entity1.fire(event, contactResult);
                    }
                    if (entity2?.hasEvent(event)) {
                        const contactResult = new ContactResult(entity1, normal, depth, point, offset, points1, points2);
                        entity2.fire(event, contactResult);
                    }
                    break;
                }

                case CONTACT_TYPE_PERSISTED: {
                    const event = 'contact:persisted';
                    if (entity1?.hasEvent(event)) {
                        entity1.fire(event, entity2);
                    }
                    if (entity2?.hasEvent(event)) {
                        entity2.fire(event, entity1);
                    }
                    break;
                }

                case CONTACT_TYPE_REMOVED: {
                    const event = 'contact:removed';
                    if (entity1?.hasEvent(event)) {
                        entity1.fire(event, entity2);
                    }
                    if (entity2?.hasEvent(event)) {
                        entity2.fire(event, entity1);
                    }
                }
            }
        }
    }

    static handleCharContacts(cb, map) {
        const charsCount = cb.read(BUFFER_READ_UINT32);

        for (let c = 0; c < charsCount; c++) {
            const charIndex = cb.read(BUFFER_READ_UINT32);
            const contactsCount = cb.read(BUFFER_READ_UINT32);
            const charEntity = map.get(charIndex);

            let results = emptyResult;

            if (!charEntity.hasEvent('contact:char')) {
                cb.skip(1 * contactsCount, UINT8_SIZE);
                cb.skip(13 * contactsCount, FLOAT32_SIZE);
                continue;
            }

            for (let i = 0; i < contactsCount; i++) {
                const isValidBody2 = cb.read(BUFFER_READ_BOOL);
                const otherIndex = cb.read(BUFFER_READ_UINT32);

                let otherEntity = null;
                if (isValidBody2) {
                    otherEntity = map.get(otherIndex) || null;
                }

                const cp = fromBuffer(cb); // contact position
                const cn = fromBuffer(cb); // contact normal
                const cv = fromBuffer(cb); // contact velocity
                const nv = fromBuffer(cb); // new char velocity

                const result = new CharContactResult(otherEntity, cp, cn, cv, nv);
                if (results === emptyResult) {
                    results = [];
                }
                results.push(result);
            }

            charEntity.fire('contact:char', results);
        }
    }

    static handleCastQuery(cb, queryMap) {
        const queryIndex = cb.read(BUFFER_READ_UINT16);
        const hitsCount = cb.read(BUFFER_READ_UINT16);

        let result = emptyResult;

        for (let i = 0; i < hitsCount; i++) {
            const bodyIndex = cb.read(BUFFER_READ_UINT32);

            const entity = ShapeComponentSystem.entityMap.get(bodyIndex);
            if (!entity) {
                // Entity could have been deleted by the time the raycast result arrived.
                // We just ignore this result then.

                cb.skip(4 * FLOAT32_SIZE); // point + fraction
                if (cb.flag) {
                    cb.skip(3 * FLOAT32_SIZE); // normal
                }
                continue;
            }

            const point = new Vec3(
                cb.read(BUFFER_READ_FLOAT32),
                cb.read(BUFFER_READ_FLOAT32),
                cb.read(BUFFER_READ_FLOAT32)
            );

            const fraction = cb.read(BUFFER_READ_FLOAT32);

            let normal;
            if (cb.flag) {
                normal = new Vec3(
                    cb.read(BUFFER_READ_FLOAT32),
                    cb.read(BUFFER_READ_FLOAT32),
                    cb.read(BUFFER_READ_FLOAT32)
                );
            }

            const r = new CastResult(entity, point, fraction, normal);

            if (result === emptyResult) {
                result = [];
            }
            result.push(r);
        }

        const callback = queryMap.get(queryIndex);
        queryMap.free(queryIndex);
        callback?.(result);
    }

    static handleCollidePointQuery(cb, queryMap) {
        const queryIndex = cb.read(BUFFER_READ_UINT16);
        const hitsCount = cb.read(BUFFER_READ_UINT16);

        let result = emptyResult;

        for (let i = 0; i < hitsCount; i++) {
            const bodyIndex = cb.read(BUFFER_READ_UINT32);

            const entity = ShapeComponentSystem.entityMap.get(bodyIndex);
            if (!entity) {
                continue;
            }

            if (result === emptyResult) {
                result = [];
            }
            result.push(entity);
        }

        const callback = queryMap.get(queryIndex);
        queryMap.free(queryIndex);
        callback?.(result);
    }

    static handleCollideShapeQuery(cb, queryMap) {
        const queryIndex = cb.read(BUFFER_READ_UINT16);
        const firstOnly = cb.read(BUFFER_READ_BOOL);
        const hitsCount = cb.read(BUFFER_READ_UINT16);

        let result = emptyResult;

        if (firstOnly) {
            if (hitsCount > 0) {
                const bodyIndex = cb.read(BUFFER_READ_UINT32);
                const entity = ShapeComponentSystem.entityMap.get(bodyIndex);
                if (entity) {
                    if (result === emptyResult) {
                        result = [];
                    }
                    result.push(new CollideShapeResult(
                        entity,
                        fromBuffer(cb),
                        fromBuffer(cb),
                        fromBuffer(cb),
                        cb.read(BUFFER_READ_FLOAT32),
                        cb.flag ? fromBuffer(cb) : null
                    ));
                } else {
                    cb.skip(10 * FLOAT32_SIZE);
                    if (cb.flag) {
                        cb.skip(3 * FLOAT32_SIZE);
                    }
                }
            }
        } else {
            for (let i = 0; i < hitsCount; i++) {
                const bodyIndex = cb.read(BUFFER_READ_UINT32);
                const entity = ShapeComponentSystem.entityMap.get(bodyIndex);
                if (entity) {
                    if (result === emptyResult) {
                        result = [];
                    }
                    result.push(new CollideShapeResult(
                        entity,
                        fromBuffer(cb),
                        fromBuffer(cb),
                        fromBuffer(cb),
                        cb.read(BUFFER_READ_FLOAT32),
                        cb.flag ? fromBuffer(cb) : null
                    ));
                } else {
                    cb.skip(10 * FLOAT32_SIZE);
                    if (cb.flag) {
                        cb.skip(3 * FLOAT32_SIZE);
                    }
                }
            }
        }

        const callback = queryMap.get(queryIndex);
        queryMap.free(queryIndex);
        callback?.(result);
    }

    static handleCharCallback(cb, queryMap) {
        const cbIndex = cb.read(BUFFER_READ_UINT16);
        const callback = queryMap.get(cbIndex);
        const bool = cb.read(BUFFER_READ_BOOL);

        queryMap.free(cbIndex);
        callback?.(bool);
    }
}

export { ResponseHandler, CastResult };
