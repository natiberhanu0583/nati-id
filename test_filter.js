const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
async function test() {
    const c = createCanvas(200, 200);
    const g = c.getContext('2d');
    g.fillStyle = 'red';
    g.fillRect(0,0,200,200);
    g.filter = 'brightness(122%) sepia(20%) saturate(41%) grayscale(20%)';
    g.fillStyle = 'blue';
    g.fillRect(50,50,100,100);
    const buf = c.toBuffer('image/png');
    fs.writeFileSync('test_filter.png', buf);
    console.log("Image saved!");
}
test();
