import { makeCube, PointGroup, PerspectiveGroup } from './vector';
import { connect } from './client';

(async () => {
    const cube = makeCube(20, { r: 0, g: 1, b: 0 });
    const cube2 = makeCube(10, { r: 1, g: 0, b: 0 });
    cube2.scale({ x: 0.5, y: 0.5, z: 0.5 });
    cube2.rotateX(Math.PI / 4);
    cube2.rotateY(Math.PI / 4);
    const cubeGroup = new PointGroup([cube, cube2]);
    const perspective = new PerspectiveGroup([cubeGroup]);
    perspective.translate({ z: -1 });
    const client = await connect('ws://localhost:1532');
    function* generatePoints() {
        for (const p of perspective.getPoints({
            beginSamples: 30,
            laserOnSamples: 0,
            endSamples: 10,
            laserOffSamples: 2,
        })) {
            yield p;
            cubeGroup.rotateX(0.00001);
            cubeGroup.rotateY(0.000008);
            cubeGroup.rotateZ(0.000005);
        };

    }
    client.attachGenerator(generatePoints);
})();
