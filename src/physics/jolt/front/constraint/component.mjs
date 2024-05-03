import { Debug } from '../../debug.mjs';
import { Component } from '../component.mjs';
import { ConeConstraint } from './types/cone.mjs';
import { DistanceConstraint } from './types/distance.mjs';
import { FixedConstraint } from './types/fixed.mjs';
import { HingeConstraint } from './types/hinge.mjs';
import { PointConstraint } from './types/point.mjs';
import { PulleyConstraint } from './types/pulley.mjs';
import { SixDOFConstraint } from './types/six-dof.mjs';
import { SliderConstraint } from './types/slider.mjs';
import { SwingTwistConstraint } from './types/swing-twist.mjs';
import {
    CONSTRAINT_TYPE_CONE, CONSTRAINT_TYPE_DISTANCE, CONSTRAINT_TYPE_FIXED,
    CONSTRAINT_TYPE_HINGE, CONSTRAINT_TYPE_POINT, CONSTRAINT_TYPE_PULLEY,
    CONSTRAINT_TYPE_SIX_DOF, CONSTRAINT_TYPE_SLIDER, CONSTRAINT_TYPE_SWING_TWIST
} from '../../constants.mjs';

class ConstraintComponent extends Component {
    _list = new Set();

    addJoint(type, otherEntity, opts = {}) {
        let JointConstructor;
        switch (type) {
            case CONSTRAINT_TYPE_SWING_TWIST:
                JointConstructor = SwingTwistConstraint;
                break;
            case CONSTRAINT_TYPE_FIXED:
                JointConstructor = FixedConstraint;
                break;
            case CONSTRAINT_TYPE_POINT:
                JointConstructor = PointConstraint;
                break;
            case CONSTRAINT_TYPE_DISTANCE:
                JointConstructor = DistanceConstraint;
                break;
            case CONSTRAINT_TYPE_HINGE:
                JointConstructor = HingeConstraint;
                break;
            case CONSTRAINT_TYPE_SLIDER:
                JointConstructor = SliderConstraint;
                break;
            case CONSTRAINT_TYPE_CONE:
                JointConstructor = ConeConstraint;
                break;
            case CONSTRAINT_TYPE_SIX_DOF:
                JointConstructor = SixDOFConstraint;
                break;
            case CONSTRAINT_TYPE_PULLEY:
                JointConstructor = PulleyConstraint;
                break;
            default:
                if ($_DEBUG) {
                    Debug.warn(`Trying to add unrecognized constraint type: ${type}`);
                }
                return;
        }

        const joint = new JointConstructor(this.entity, otherEntity, opts);

        if (!otherEntity.constraint) {
            otherEntity.addComponent('constraint');
        }

        const index = this.system.constraintMap.add(joint);
        joint.index = index;

        this._list.add(index);
        otherEntity.constraint.list.add(index);

        this.system.createConstraint(index, joint);

        return joint;
    }

    onDisable() {
        const system = this.system;

        this._list.forEach((idx) => {
            system.destroyConstraint(idx);
        });
    }
}

export { ConstraintComponent };
