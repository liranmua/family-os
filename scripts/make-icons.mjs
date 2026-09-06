// מחולל אייקונים ל-PWA — בלי תלויות. מצייר "בית" פשוט על רקע צבע המותג.
// שימוש: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BRAND = [0x2e, 0x3a, 0x46]; // #2E3A46
const CREAM = [0xf7, 0xf5, 0xf2]; // #F7F5F2

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
  };
  // רקע מותג
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BRAND);

  const s = size;
  const cx = s / 2;
  // גוף הבית: ריבוע
  const bodyTop = s * 0.44, bodyBot = s * 0.78;
  const bodyL = s * 0.28, bodyR = s * 0.72;
  for (let y = bodyTop; y < bodyBot; y++)
    for (let x = bodyL; x < bodyR; x++) put(Math.round(x), Math.round(y), CREAM);
  // גג: משולש
  const roofTop = s * 0.20, roofBot = bodyTop;
  const roofL = s * 0.20, roofR = s * 0.80;
  for (let y = roofTop; y < roofBot; y++) {
    const t = (y - roofTop) / (roofBot - roofTop);
    const halfW = ((roofR - roofL) / 2) * t;
    for (let x = cx - halfW; x <= cx + halfW; x++) put(Math.round(x), Math.round(y), CREAM);
  }
  // דלת: חור בצבע הרקע
  const dL = s * 0.44, dR = s * 0.56, dT = s * 0.56, dB = bodyBot;
  for (let y = dT; y < dB; y++)
    for (let x = dL; x < dR; x++) put(Math.round(x), Math.round(y), BRAND);
  return buf;
}

mkdirSync(new URL("../app/icons/", import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  const out = new URL(`../app/icons/icon-${size}.png`, import.meta.url);
  writeFileSync(out, png(size, size, draw(size)));
  console.log("wrote", out.pathname);
}
// maskable: אותו ציור (הרקע ממלא את כל הקנבס, אז ה-safe-zone מכוסה)
writeFileSync(new URL("../app/icons/icon-maskable-512.png", import.meta.url), png(512, 512, draw(512)));
console.log("wrote icon-maskable-512.png");
