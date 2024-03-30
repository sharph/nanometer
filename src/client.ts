
import { Point } from '@laser-dac/core';
import { WebSocket } from 'ws';


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
        this.ws.on('message', (msg) => {
            const decoded = JSON.parse(msg.toString()) as number;
            this.getPoints(decoded).then((points) => {
                this.ws.send(JSON.stringify(this.centerOrigin ? points.map(this.transformForCenterOrigin) : points));
            });
        });
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
        ws.on('open', () => {
            ws.removeAllListeners('close');
            ws.removeAllListeners('error');
            res(new NanometerClient(ws, getPoints));
        });

        ws.once('error', e => err(e));
        ws.once('close', e => err(e));
    });
}
