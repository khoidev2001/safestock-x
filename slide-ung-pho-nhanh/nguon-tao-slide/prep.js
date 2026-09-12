const sharp = require('sharp');

(async () => {
  const src = 'login-emergency-response-background.png';
  const W = 2560, H = 1440;

  // Title background: full colour, lightly deepened
  await sharp(src).resize(W, H, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.88, saturation: 1.04 })
    .jpeg({ quality: 92 }).toFile('bg-title.jpg');

  // Content background: blurred + dark, keeps the brand world without fighting text
  await sharp(src).resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(26).modulate({ brightness: 0.34, saturation: 0.62 })
    .jpeg({ quality: 88 }).toFile('bg-content.jpg');

  // Closing background: medium blur, mid dark
  await sharp(src).resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(10).modulate({ brightness: 0.55, saturation: 0.9 })
    .jpeg({ quality: 90 }).toFile('bg-closing.jpg');

  // Horizontal scrim (dark on the left, clear on the right)
  const gw = 1280, gh = 720;
  const buf = Buffer.alloc(gw * gh * 4);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = x / (gw - 1);
      const a = Math.round(238 * Math.pow(1 - t, 1.25));
      const i = (y * gw + x) * 4;
      buf[i] = 3; buf[i + 1] = 14; buf[i + 2] = 28; buf[i + 3] = a;
    }
  }
  await sharp(buf, { raw: { width: gw, height: gh, channels: 4 } }).png().toFile('scrim-left.png');

  // Vertical scrim (clear on top, dark at the bottom)
  const buf2 = Buffer.alloc(gw * gh * 4);
  for (let y = 0; y < gh; y++) {
    const t = y / (gh - 1);
    const a = Math.round(225 * Math.pow(t, 1.6));
    for (let x = 0; x < gw; x++) {
      const i = (y * gw + x) * 4;
      buf2[i] = 3; buf2[i + 1] = 14; buf2[i + 2] = 28; buf2[i + 3] = a;
    }
  }
  await sharp(buf2, { raw: { width: gw, height: gh, channels: 4 } }).png().toFile('scrim-bottom.png');

  // Logo trimmed of transparent padding
  await sharp('ung-pho-nhanh-logo.png').trim().png().toFile('logo-trim.png');
  await sharp('ung-pho-nhanh-mark.png').trim().png().toFile('mark-trim.png');

  for (const f of ['logo-trim.png', 'mark-trim.png']) {
    const m = await sharp(f).metadata();
    console.log(f, m.width + 'x' + m.height, (m.width / m.height).toFixed(3));
  }
})();
