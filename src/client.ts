
import { Point } from '@laser-dac/core';
import WebSocket from 'isomorphic-ws';

import { encodePointResponse, decodeMessage, isPointRequestMessage } from './proto';

export class NanometerClient {
    private getPoints: (num: number) => Promise<Point[]> = async (num: number) => {
        return Array(num).fill({ x: 0.5, y: 0.5, r: 0, g: 0, b: 0 });
    }
    private generatorFn: (() => Generator<Point, any, Point>) | null = null;
    private generator: Generator<Point, any, Point> | null = null;

    constructor(private ws: WebSocket, getPoints?: (num: number) => Promise<Point[]>, public centerOrigin: boolean = true) {
        if (getPoints) {
            this.getPoints = getPoints
        }
        this.ws.onmessage = async (event) => {
            const decoded = await decodeMessage(event.data as ArrayBuffer);
            if (!isPointRequestMessage(decoded)) {
                return;
            }
            this.getPoints(decoded.num).then((points: Point[]) => {
                this.ws.send(encodePointResponse(this.centerOrigin ? points.map(this.transformForCenterOrigin) : points));
            });
        };
    }

    private transformForCenterOrigin(point: Point) {
        return {
            x: (point.x + 1) / 2,
            y: (point.y + 1) / 2,
            r: point.r,
            g: point.g,
            b: point.b
        }
    }

    attachGetPoints(getPoints: typeof this.getPoints) {
        this.getPoints = getPoints;
    }

    attachGenerator(generatorFn: (() => Generator<Point, any, Point>)) {
        this.generatorFn = generatorFn;
        this.getPoints = async (num) => {
            if (!this.generatorFn) {
                throw new Error('no iterable');
            }
            const points: Point[] = [];
            for (let i = 0; i < num; i++) {
                if (this.generator === null) {
                    this.generator = this.generatorFn();
                }
                let value = this.generator.next();
                while (value.done) {
                    this.generator = this.generatorFn();
                    value = this.generator.next();
                }
                points.push(value.value);
            }
            return points;
        };
    }
}

export function connect(addr: string, getPoints?: ((num: number) => Promise<Point[]>)): Promise<NanometerClient> {
    const ws = new WebSocket(addr);
    return new Promise((res, err) => {
        ws.onopen = () => {
            res(new NanometerClient(ws, getPoints));
        };

        ws.onerror = (e) => err(e);
    });
}
