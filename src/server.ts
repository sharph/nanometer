
import { DAC, Point, Device, Scene } from '@laser-dac/core';
import { Simulator } from '@laser-dac/simulator';
import { EtherDream } from '@laser-dac/ether-dream';
import { relativeToPosition, relativeToColor } from '@laser-dac/ether-dream/dist/convert';
import { WebSocketServer, WebSocket } from 'ws';

const USE_ETHER_DREAM = process.env.USE_ETHER_DREAM;

const MIN_POINTS_PER_BUFFER = 1000;

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

    async load(block = false) {
        if (this.nextPointCallback === null) {
            return;
        }
        if (this.loading) {
            if (block) {
                await this.loading;
            }
            return;
        }
        this.loading = this.nextPointCallback(MIN_POINTS_PER_BUFFER);
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
                this.buffer.push({ x: 0.5, y: 0.5, r: 1, g: 0, b: 0 });
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
                    if (this.nextPointCallback === null) {
                        return;
                    }
                    while (this.buffer.length < num) {
                        await this.load(true);
                    }
                    const toSend: any = [];
                    while (this.buffer.length > 0) {
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
            const msg = JSON.stringify(num);
            if (activeWS !== null) {
                activeWS.send(msg);
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

        ws.on('message', (msg) => {
            const decoded = JSON.parse(msg.toString()) as Point[];
            if (pointsCallback !== null) {
                pointsCallback(decoded);
                pointsCallback = null;
            } else {
                console.warn('messasge received and no callback set!');
            }
        });
    });
    console.info('WebSocket server listening at ws://localhost:1532');
})();

