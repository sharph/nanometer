import { Vector3, Matrix4 } from 'three';

export type Color = {
    r: number,
    g: number,
    b: number
}

export type Point = {
    x: number,
    y: number,
    z?: number,
    r: number,
    g: number,
    b: number,
};

export type BlankingOptions = {
    beginSamples: number;  // amount of samples we need to hold before laser starts moving
    laserOnSamples: number; // amount of samples the laser needs to be "on" before it starts emitting light
    endSamples: number; // amount of samples we need to hold before laser stops moving
    laserOffSamples: number; // amount of samples the laser needs to be "off" before it actually stops emitting
};

export class PointGroup {
    public affine: Matrix4;

    constructor(public points?: (Point | PointGroup)[], public blank: boolean = false) {
        this.affine = new Matrix4();
    }

    *startBlanking(point: Point, blankingOptions?: BlankingOptions) {
        if (!this.blank || !blankingOptions) {
            return;
        }
        for (var i = 0; i < blankingOptions.beginSamples; i++) {
            if (i >= blankingOptions.beginSamples - blankingOptions.laserOnSamples) {
                yield point;
            } else {
                yield { ...point, r: 0, g: 0, b: 0 };
            }
        }
    }

    *endBlanking(point: Point, blankingOptions?: BlankingOptions) {
        if (!this.blank || !blankingOptions) {
            return;
        }
        for (var i = 0; i < blankingOptions.endSamples; i++) {
            if (i < blankingOptions.endSamples - blankingOptions.laserOffSamples) {
                yield point;
            } else {
                yield { ...point, r: 0, g: 0, b: 0 };
            }
        }
    }

    rotateX(theta: number) {
        this.affine = new Matrix4().makeRotationX(theta).multiply(this.affine);
    }

    rotateY(theta: number) {
        this.affine = new Matrix4().makeRotationY(theta).multiply(this.affine);
    }

    rotateZ(theta: number) {
        this.affine = new Matrix4().makeRotationZ(theta).multiply(this.affine);
    }

    scale({ x = 0, y = 0, z = 0 }) {
        this.affine = new Matrix4().makeScale(x, y, z).multiply(this.affine);
    }

    translate({ x = 0, y = 0, z = 0 }) {
        this.affine = new Matrix4().makeTranslation(new Vector3(x, y, z)).multiply(this.affine);
    }


    applyMatrix(point: Point, affine: Matrix4) {
        let { x, y, z = 0 } = point;
        const vec = new Vector3(x, y, z);
        vec.applyMatrix4(affine);
        [x, y, z] = [vec.x, vec.y, vec.z];
        return { ...point, x, y, z };
    }

    *getPoints(blankingOptions?: BlankingOptions, affine?: Matrix4): Generator<Point, void> {
        if (!affine) {
            affine = new Matrix4();
        }
        const matrixToApply = affine.clone().multiply(this.affine);
        if (this.points === undefined) {
            return;
        }
        let started = false;
        let lastPoint: Point | null = null;
        for (const point of this.points) {
            if (point instanceof PointGroup) {
                for (const pointInGroup of point.getPoints(blankingOptions, matrixToApply)) {
                    if (!started) {
                        yield* this.startBlanking(pointInGroup, blankingOptions);
                        started = true;
                    }
                    yield pointInGroup;
                    lastPoint = pointInGroup;
                }
            } else {
                const transformedPoint = this.applyMatrix(point, matrixToApply);
                if (!started) {
                    yield* this.startBlanking(transformedPoint, blankingOptions);
                }
                yield transformedPoint;
                lastPoint = transformedPoint;
            }
        }
        if (lastPoint) {
            yield* this.endBlanking(lastPoint, blankingOptions);
        }
    }
}

export class PerspectiveGroup extends PointGroup {
    *getPoints(blankingOptions?: BlankingOptions, affine?: Matrix4): Generator<Point, void> {
        for (const point of super.getPoints(blankingOptions, affine)) {
            const d = 1 / (2 - (point.z || 0));
            yield {
                x: d * point.x,
                y: d * point.y,
                r: point.r,
                g: point.g,
                b: point.b,
            }
        }
    }
}

export abstract class ComputedPointGroup extends PointGroup {
    abstract computePoints(): Generator<Point, void>

    *getPoints(blankingOptions?: BlankingOptions, affine?: Matrix4): Generator<Point, void> {
        if (!affine) {
            affine = new Matrix4();
        }
        const matrixToApply = affine.clone().multiply(this.affine);
        let started = false;
        let lastPoint: Point | null = null;
        for (const point of this.computePoints()) {
            const transformedPoint = this.applyMatrix(point, matrixToApply);
            if (!started) {
                yield* this.startBlanking(transformedPoint, blankingOptions);
                started = true;
            }
            yield transformedPoint;
            lastPoint = transformedPoint;
        }
        if (lastPoint) {
            yield* this.endBlanking(lastPoint, blankingOptions);
        }
    }
}

export class Circle extends ComputedPointGroup {
    constructor(public color: Color, public numPoints: number = 100, blank: boolean = true) {
        super([], blank);
    }

    *computePoints() {
        for (var i = 0; i <= this.numPoints; i++) {
            yield {
                x: Math.sin(i / this.numPoints * Math.PI * 2),
                y: Math.cos(i / this.numPoints * Math.PI * 2),
                ...this.color
            }
        }
    }
}

export class Line extends ComputedPointGroup {
    constructor(public start: Point, public end: Point, public numPoints: number = 100, blank: boolean = true) {
        super([], blank);
    }

    *computePoints() {
        for (var i = 0; i <= this.numPoints; i++) {
            const pctEnd = i / this.numPoints;
            const pctStart = 1 - pctEnd;
            const z = (this.start.z && this.end.z) ?
                (pctStart * this.start.z) + (pctEnd * this.end.z) : undefined;
            yield {
                x: (pctStart * this.start.x) + (pctEnd * this.end.x),
                y: (pctStart * this.start.y) + (pctEnd * this.end.y),
                z,
                r: (pctStart * this.start.r) + (pctEnd * this.end.r),
                g: (pctStart * this.start.g) + (pctEnd * this.end.g),
                b: (pctStart * this.start.b) + (pctEnd * this.end.b),
            }
        }
    }
}

/*      ______
 *     /|    /|
 *    /_|___/ |
 *   |  |___|_|
 *   | /    | /
 *   |/_____|/ 
 */

export function makeCube(pointsPerLine: number, color: Color, blank: boolean = true) {
    const coords = [
        [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 },],  // x
        [{ x: -1, y: 1, z: -1 }, { x: 1, y: 1, z: -1 },],
        [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 },],
        [{ x: -1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 },],
        [{ x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 },],  // y
        [{ x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 },],
        [{ x: -1, y: -1, z: 1 }, { x: -1, y: 1, z: 1 },],
        [{ x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 },],
        [{ x: -1, y: -1, z: -1 }, { x: -1, y: -1, z: 1 },],  // z
        [{ x: 1, y: -1, z: -1 }, { x: 1, y: -1, z: 1 },],
        [{ x: -1, y: 1, z: -1 }, { x: -1, y: 1, z: 1 },],
        [{ x: 1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 },],
    ];
    return new PointGroup(
        coords.map(
            ([start, end]) => (new Line({ ...start, ...color }, { ...end, ...color }, pointsPerLine, blank))
        )
    );
}