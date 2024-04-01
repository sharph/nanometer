
import { DAC, Point, Device, Scene } from '@laser-dac/core';
import { Simulator } from '@laser-dac/simulator';
import { EtherDream } from '@laser-dac/ether-dream';
import { relativeToPosition, relativeToColor } from '@laser-dac/ether-dream/dist/convert';
import { WebSocketServer, WebSocket } from 'ws';
import { encodePointRequest, isPointResponseMessage, decodeMessage } from './proto';

const USE_ETHER_DREAM = process.env.USE_ETHER_DREAM;

const MIN_POINTS_PER_BUFFER = 1000; // 1000 seems to be the sweet spot?
const MIN_POINTS_PER_LOAD = 100;

class PullDAC extends DAC {
    private interval: ReturnType<typeof setTimeout> | null = null
    private nextPointCallback: Function | null = null;
    private pointsRate: number = 30000;
    private buffer: Point[] = [];
    private bufferToStream: Point[] = [];
    private clockMaster: EtherDream | null = null;
    private loading: Promise<Point[] | Point> | null = null;

    use(device: Device) {
        if (device instanceof EtherDream) {
            this.clockMaster = device;
        }
        super.use(device);
    }

    async start() {
        const res = await super.start();
        return res;
    }

    async stop() {
        await super.stop();
        if (this.interval !== null) {
            clearInterval(this.interval);
        }
    }

    async load(num: number = MIN_POINTS_PER_LOAD, block = false) {
        if (this.nextPointCallback === null) {
            return;
        }
        if (this.loading) {
            if (block) {
                await this.loading;
            }
            return;
        }
        this.loading = this.nextPointCallback(Math.max(num, MIN_POINTS_PER_BUFFER, MIN_POINTS_PER_LOAD));
        this.buffer = this.buffer.concat(await this.loading as Point[] | Point);
        this.loading = null;
    }

    async syntheticClockTick() {
        if (this.nextPointCallback === null) {
            return;
        }
        while (this.bufferToStream.length < MIN_POINTS_PER_BUFFER) {
            if (this.buffer.length < MIN_POINTS_PER_BUFFER * 2) {
                this.load();
            }
            if (this.buffer.length === 0) {
                this.buffer.push({ x: 0.5, y: 0.5, r: 0, g: 0, b: 0 });
            }
            this.bufferToStream.push(this.buffer.shift() as Point);
        }
        this.stream({ points: this.bufferToStream }, this.pointsRate);
        this.bufferToStream = [];
    }

    private startStreamingEtherDream() {
        if (!this.clockMaster?.connection) {
            throw new Error('clockMaster.connection is not setup');
        }
        this.clockMaster.connection?.streamPoints(
            this.pointsRate,
            (num, callback) =>
                (async () => {
                    const pointsNeeded = Math.max(1000, num);
                    if (this.nextPointCallback === null) {
                        return;
                    }
                    while (this.buffer.length < pointsNeeded) {
                        this.buffer.push(
                            { x: 0.5, y: 0.5, r: 0, g: 0, b: 0 }
                        );
                    }
                    const toSend: any = [];
                    while (toSend.length < pointsNeeded) {
                        const shifted = this.buffer.shift();

                        toSend.push(((point) => ({
                            x: relativeToPosition(point.x),
                            y: relativeToPosition(point.y),
                            r: relativeToColor(point.r),
                            g: relativeToColor(point.g),
                            b: relativeToColor(point.b),
                        }))(shifted as Point));
                        this.bufferToStream.push(shifted as Point);
                        if (this.bufferToStream.length >= MIN_POINTS_PER_BUFFER) {
                            this.stream({ points: this.bufferToStream }, this.pointsRate);
                            this.bufferToStream = [];
                        }
                    }
                    setTimeout(this.load.bind(this), 0, MIN_POINTS_PER_BUFFER);
                    return toSend;
                })().then((res) => callback(res))
        );
    }

    stream(scene: Scene, pointsRate = 30000, fps = 30) {
        for (const device of this.devices) {
            if (device !== this.clockMaster) {
                device.stream(scene, pointsRate, fps);
            }
        }
    }

    streamFrom(nextPointsCallback: Function, pointsRate = 30000) {
        this.nextPointCallback = nextPointsCallback;
        this.pointsRate = pointsRate;
        if (!this.clockMaster) {
            this.interval = setInterval(
                this.syntheticClockTick.bind(this),
                MIN_POINTS_PER_BUFFER / pointsRate * 1000
            );
        } else {
            this.startStreamingEtherDream()
        }
    }
}

(async () => {
    const dac = new PullDAC();
    dac.use(new Simulator());
    if (USE_ETHER_DREAM) {
        dac.use(new EtherDream());
    }
    await dac.start();
    let activeWS: WebSocket | null = null;
    let pointsCallback: ((points: Point[] | Point) => void) | null = null;
    const wss = new WebSocketServer({
        port: 1532
    });
    dac.streamFrom((num: number) => {
        return new Promise((res: ((points: Point[] | Point) => void)) => {
            if (activeWS !== null) {
                activeWS.send(encodePointRequest(num));
                pointsCallback = res;
            } else {
                res(Array(num).fill({ x: 0.5, y: 0.5, r: 0, g: 0, b: 0 }));
            }
        });
    });
    wss.on('connection', (ws) => {
        if (activeWS) {
            console.warn('Client already connected');
            ws.close();
            return;
        }
        console.info('new client connected');
        activeWS = ws;

        ws.on('close', () => {
            activeWS = null;
            if (pointsCallback) {
                pointsCallback([]);
            }
            console.info('disconnected');
        });

        ws.on('error', () => {
            activeWS = null;
            if (pointsCallback) {
                pointsCallback([]);
            }
            console.info('disconnected due to error');
        });

        ws.on('message', async (msg: Buffer) => {
            const decoded = await decodeMessage(msg);
            if (!isPointResponseMessage(decoded)) {
                return;
            }
            if (pointsCallback !== null) {
                pointsCallback(decoded.points);
                pointsCallback = null;
            } else {
                console.warn('messasge received and no callback set!');
            }
        });
    });
    console.info('WebSocket server listening at ws://localhost:1532');
})();

