
import { connect } from './client';

(async () => {
    function* pointGenerator() {
        let t = 0;
        while (true) {
            let offset = 0;
            for (const c of [
                { r: 1, g: 1, b: 1 },
                { r: 1, g: 0, b: 0 },
                { r: 1, g: 1, b: 0 },
                { r: 0, g: 1, b: 0 },
                { r: 0, g: 1, b: 1 },
                { r: 0, g: 0, b: 1 },
            ]) {
                for (let x = 0; true; x += 0.01) {
                    const X = x / 2 + 0.25;
                    const Y = Math.sin(x * 3.14 * 2) * (Math.sin(x * 8 + (t / 10000) + (offset * 0.1)) + (offset * 0.1)) / 4 + 0.5;
                    if (x === 0) {
                        for (let i = 0; i < 20; i++) {
                            t++;
                            yield { x: X, y: Y, r: 0, g: 0, b: 0 };
                        }
                    }
                    yield { x: X, y: Y, ...c };
                    t++;
                    if (x > 1) {
                        for (let i = 0; i < 5; i++) {
                            t++;
                            yield { x: X, y: Y, ...c };
                        }
                        break;
                    }
                }
                offset++;
            }
        }
    }
    const client = await connect('ws://localhost:1532');
    console.log('connected');
    client.attachGenerator(pointGenerator);
})();
