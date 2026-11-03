const fs = require('fs');
const path = require('path');

// Exclusive creation reserves the name even when several windows/jobs save together.
async function writeImage(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const ext = path.extname(file), stem = file.slice(0, -ext.length);
  let n = 1;
  while (true) {
    const target = n === 1 ? file : `${stem} ${n}${ext}`;
    let handle;
    try { handle = await fs.promises.open(target, 'wx'); }
    catch (err) {
      if (err.code === 'EEXIST') { n++; continue; }
      throw err;
    }
    try {
      await handle.writeFile(Buffer.from(data));
      await handle.close();
      return target;
    } catch (err) {
      await handle.close().catch(() => {});
      await fs.promises.unlink(target).catch(() => {});
      throw err;
    }
  }
}
async function readClipboard(clipboard, toPNG) {
  const items = await clipboard.read();
  let image = null, text = '';
  for (const item of items) {
    const type = item.types.includes('image/png') ? 'image/png' : item.types.find((t) => t.startsWith('image/'));
    if (type && !image) {
      const blob = await item.getType(type), bytes = Buffer.from(await blob.arrayBuffer());
      image = new Uint8Array(type === 'image/png' ? bytes : toPNG(bytes));
    }
    if (item.types.includes('text/plain') && !text) text = await (await item.getType('text/plain')).text();
  }
  return { image, text };
}
async function writeVideoThumbnail(video,data) {
  if(typeof video!=='string'||!path.isAbsolute(video)||!path.extname(video))throw new Error('A local exported video is required.');
  await fs.promises.access(video);
  const target=video.slice(0,-path.extname(video).length)+'.jpg';
  const handle=await fs.promises.open(target,'wx');
  try{await handle.writeFile(Buffer.from(data));await handle.close();return target;}catch(err){await handle.close().catch(()=>{});await fs.promises.unlink(target).catch(()=>{});throw err;}
}
module.exports = { writeImage, readClipboard, writeVideoThumbnail };
