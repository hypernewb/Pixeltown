// Turning a canvas into bytes. The browser has canvas.toBlob, but the export
// pipeline is also exercised from Node during verification where there is no
// DOM, so the pixels are encoded here instead of borrowed from the platform.

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// A zlib stream of stored (uncompressed) deflate blocks: every PNG reader
// accepts it, and it keeps this file free of a compression dependency.
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  const MAX = 0xffff;
  if (raw.length === 0) blocks.push(new Uint8Array([1, 0, 0, 0xff, 0xff]));
  for (let off = 0; off < raw.length; off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const last = off + len >= raw.length ? 1 : 0;
    const head = new Uint8Array(5);
    head[0] = last;
    head[1] = len & 0xff;
    head[2] = (len >> 8) & 0xff;
    head[3] = ~len & 0xff;
    head[4] = (~len >> 8) & 0xff;
    blocks.push(head, raw.subarray(off, off + len));
  }
  let size = 2;
  for (const b of blocks) size += b.length;
  const out = new Uint8Array(size);
  out[0] = 0x78;
  out[1] = 0x01;
  let p = 2;
  for (const b of blocks) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

export function encodePNG(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const stride = width * 4;
  // every scanline carries a leading filter byte, all zero (no filtering)
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  const png = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

// The pixels of a canvas, in the top-down order PNG expects.
export function readCanvas(canvas: { width: number; height: number; getContext(id: '2d'): CanvasRenderingContext2D | null }): Uint8ClampedArray {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('the bake produced no 2D context to read');
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}
