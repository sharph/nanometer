import { Circle, PointGroup, PerspectiveGroup } from './vector';
import { connect } from './client';

// a^2 + b^2 = 1
// a^2 = (1 - b^2)
// a = sqrt(1 - b^2)

(async () => {
    let group = new PointGroup([]);
    for (let i = 0; i <= 16; i++) {
        const circle = new Circle({ r: 1, g: 0, b: 0 }, 60);
        const s = Math.sqrt(1 - (((i / 16) - 0.5) * 2) ** 2);
        circle.scale({ x: s, y: s, z: s });
        circle.translate({ z: i * 2 / 16 - 1 });
        group.points?.push(circle);
    }
    const perspective = new PerspectiveGroup([group]);
    perspective.translate({ z: -1 });
    const client = await connect('ws://localhost:1532');
    function* generatePoints() {
        for (const p of perspective.getPoints({
            beginSamples: 20,
            laserOnSamples: 0,
            endSamples: 8,
            laserOffSamples: 0,
        })) {
            yield p;
            group.rotateX(0.000021);
            group.rotateY(0.000018);
            group.rotateZ(0.000011);
        };

    }
    client.attachGenerator(generatePoints);
})();
