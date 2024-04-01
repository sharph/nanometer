const { makeCube, PerspectiveGroup, PointGroup } = Nanometer.vector;
const nmconnect = Nanometer.connect;

let pointsToDraw = [];
let cubeGroup;

function setup() {
  createCanvas(400, 400);
  const cube = makeCube(20, { r: 0, g: 1, b: 0 });
  const cube2 = makeCube(10, { r: 1, g: 0, b: 0 });
  cube2.scale({ x: 0.5, y: 0.5, z: 0.5 });
  cube2.rotateX(Math.PI / 4);
  cube2.rotateY(Math.PI / 4);
  cubeGroup = new PointGroup([cube, cube2]);
  const perspectiveG = new PerspectiveGroup([cubeGroup]);
  perspectiveG.translate({ z: -1 });
  function* generatePoints() {
    for (const p of perspectiveG.getPoints({
      beginSamples: 30,
      laserOnSamples: 0,
      endSamples: 10,
      laserOffSamples: 2,
    })) {
      yield p;
      pointsToDraw.push(p);
    }
  }
  let client;
  nmconnect("ws://localhost:1532").then((c) => {
    client = c;
    client.attachGenerator(generatePoints);
  });
}
function draw() {
  background(20, 40);
  let i = 0;
  noStroke();
  for (const p of pointsToDraw) {
    fill(p.r * 255, p.g * 255, p.b * 255);
    circle((p.x + 1) * 200, (p.y + 1) * 200, 4);
  }
  pointsToDraw = [];
  cubeGroup.resetMatrix();
  cubeGroup.rotateZ(Math.PI / 5);
  cubeGroup.rotateX(mouseX / 100);
  cubeGroup.rotateY(mouseY / 100);
}
