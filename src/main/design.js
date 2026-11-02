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
module.exports = { writeImage };
