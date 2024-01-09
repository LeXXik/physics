import { Debug } from "../../debug.mjs";
import {
    CONTACT_TYPE_ADDED, CONTACT_TYPE_PERSISTED, CONTACT_TYPE_REMOVED,
    BUFFER_READ_BOOL, BUFFER_READ_FLOAT32, BUFFER_READ_UINT16,
    BUFFER_READ_UINT32, BUFFER_READ_UINT8, FLOAT32_SIZE, UINT8_SIZE
} from "./constants.mjs";

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

class RaycastResult {
    constructor(entity, point, normal) {
        this.entity = entity;
        this.point = point;
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
                    const normal = pc.Vec3.fromBuffer(cb);
                    const depth = cb.read(BUFFER_READ_FLOAT32);
                    const contactPoints = cb.read(BUFFER_READ_BOOL);
                    let point, points1, points2, offset;

                    if (contactPoints) {
                        const averaged = cb.read(BUFFER_READ_BOOL);

                        if (averaged) {
                            point = pc.Vec3.fromBuffer(cb);
                        } else {
                            offset = pc.Vec3.fromBuffer(cb);
                            const count1 = cb.read(BUFFER_READ_UINT32);
                            const count2 = cb.read(BUFFER_READ_UINT32);
                            points1 = [];
                            points2 = [];
                            for (let i = 0; i < count1; i++) {
                                points1.push(pc.Vec3.fromBuffer(cb));
                            }
                            for (let i = 0; i < count2; i++) {
                                points2.push(pc.Vec3.fromBuffer(cb));
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
            const results = [];

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
    
                const cp = pc.Vec3.fromBuffer(cb); // contact position
                const cn = pc.Vec3.fromBuffer(cb); // contact normal
                const cv = pc.Vec3.fromBuffer(cb); // contact velocity
                const nv = pc.Vec3.fromBuffer(cb); // new char velocity
    
                const result = new CharContactResult(otherEntity, cp, cn, cv, nv);    
                results.push(result);
            }

            charEntity.fire('contact:char', results);
        }
    }

    static handleQuery(buffer, entityMap, queryMap) {
        const results = [];

        const queryIndex = buffer.read(BUFFER_READ_UINT16);
        const hitsCount = buffer.read(BUFFER_READ_UINT16);

        for (let i = 0; i < hitsCount; i++) {
            const bodyIndex = buffer.read(BUFFER_READ_UINT32);

            const point = new pc.Vec3(
                buffer.read(BUFFER_READ_FLOAT32),
                buffer.read(BUFFER_READ_FLOAT32),
                buffer.read(BUFFER_READ_FLOAT32)
            );

            let normal;
            if (buffer.flag) {
                normal = new pc.Vec3(
                    buffer.read(BUFFER_READ_FLOAT32),
                    buffer.read(BUFFER_READ_FLOAT32),
                    buffer.read(BUFFER_READ_FLOAT32)
                );
            }

            const entity = entityMap.get(bodyIndex);
            if (!entity) {
                // Entity could have been deleted by the time the raycast result arrived.
                // We just ignore this result then.
                continue;
            }

            results.push(new RaycastResult(entity, point, normal));
        }

        const callback = queryMap.get(queryIndex);
        queryMap.free(queryIndex);
        callback?.(results);
    }

    static handleCharSetShape(cb, queryMap) {
        const cbIndex = cb.read(BUFFER_READ_UINT32);
        const callback = queryMap.get(cbIndex);

        if (Debug.dev && !callback) {
            Debug.warn(`Unable to locate callback with index: ${ cbIndex }`);
            return;
        }

        queryMap.free(cbIndex);
        callback();
    }
}

export { ResponseHandler };