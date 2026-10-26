// Builds the responsive WebP variants of the Color War key visual (the hero of the login screen and the idle board).
//
//   node scripts/hero-build.mjs <source image> [outDir=img]
//
// A canvas in the headless Edge/Chrome that scripts/audit/shots already needs does the crop, the resize and the WebP
// encoding, so no npm package is added. Re-run it with a new source image to replace the hero.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './audit/shots/lib/browser.mjs';
import { CDP } from './audit/shots/lib/cdp.mjs';

const src = process.argv[2];
const outDir = process.argv[3] || 'img';
if (!src) { console.error('usage: node scripts/hero-build.mjs <source image> [outDir]'); process.exit(2); }

// crop = [x, y, w, h] in source pixels (the poster is 1915 x 821).
// "tall" is the middle of the poster (the title, the net and a slice of both players) for a phone;
// "wide" is the whole poster for a laptop, a tablet and the TV.
const VARIANTS = [
  // the painted paper grain hides compression noise, so a lower quality than a photo needs: 4-5x smaller, same look
  { name: 'color-war-wide-1600', crop: [0, 0, 1915, 821], w: 1600, q: 0.7 },
  { name: 'color-war-wide-960', crop: [0, 0, 1915, 821], w: 960, q: 0.72 },
  { name: 'color-war-tall-800', crop: [410, 0, 1100, 821], w: 800, q: 0.72 },
  { name: 'color-war-tall-480', crop: [410, 0, 1100, 821], w: 480, q: 0.72 },
];

const bytes = fs.readFileSync(src);
const dataUrl = 'data:image/webp;base64,' + bytes.toString('base64');
const browser = await launchBrowser();
const cdp = await new CDP(browser.ws).connect();
try {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  };
  const dims = await ev('(async()=>{ window.__img = new Image(); window.__img.src = ' + JSON.stringify(dataUrl) + '; await window.__img.decode(); return [__img.naturalWidth, __img.naturalHeight]; })()');
  console.log('source ' + dims.join('x') + ', ' + bytes.length + ' bytes');
  fs.mkdirSync(outDir, { recursive: true });
  for (const v of VARIANTS) {
    const [sx, sy, sw, sh] = v.crop;
    const h = Math.round(v.w * sh / sw);
    const b64 = await ev('(()=>{ const c = document.createElement("canvas"); c.width = ' + v.w + '; c.height = ' + h + '; const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(window.__img, ' + [sx, sy, sw, sh].join(', ') + ', 0, 0, ' + v.w + ', ' + h + '); return c.toDataURL("image/webp", ' + v.q + ').split(",")[1]; })()');
    const file = path.join(outDir, v.name + '.webp');
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(file + '  ' + v.w + 'x' + h + '  ' + fs.statSync(file).size + ' bytes');
  }
} finally { cdp.close(); browser.close(); }
