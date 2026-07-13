import fs from 'node:fs';
import PImage from 'pureimage';

const WIDTH = 500;
const HEIGHT = 400;
const img = PImage.make(WIDTH, HEIGHT);
const ctx = img.getContext('2d');

ctx.fillStyle = '#eef2f5';
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// Fixed (non-random) marble positions/colors so the count is exact and
// reproducible: 11 marbles.
const marbles = [
  { x: 80, y: 90, r: 28, color: '#c0392b' },
  { x: 150, y: 60, r: 24, color: '#2980b9' },
  { x: 220, y: 100, r: 30, color: '#27ae60' },
  { x: 290, y: 70, r: 22, color: '#f39c12' },
  { x: 360, y: 110, r: 26, color: '#8e44ad' },
  { x: 100, y: 180, r: 25, color: '#16a085' },
  { x: 180, y: 200, r: 27, color: '#d35400' },
  { x: 260, y: 190, r: 23, color: '#2c3e50' },
  { x: 330, y: 210, r: 29, color: '#c0392b' },
  { x: 200, y: 290, r: 26, color: '#2980b9' },
  { x: 280, y: 300, r: 24, color: '#27ae60' },
];

for (const m of marbles) {
  ctx.fillStyle = m.color;
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2, false);
  ctx.fill();
}

await PImage.encodePNGToStream(img, fs.createWriteStream('./vision-sandbox/marbles.png'));
console.log(`Wrote marbles.png with ${marbles.length} marbles.`);
