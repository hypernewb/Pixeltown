// Bundles the in-page harness with the project's own esbuild, runs it in a
// headless browser, and reports what the page said.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

// A page that loads the bundle and shows whatever it reports, so a headless
// dump-dom run can read the result.
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>running</title></head>
<body><pre id="log"></pre><script src="./harness.js"></script></body></html>`;

export async function bundle(outDir: string): Promise<void> {
  const out = resolve(root, outDir);
  mkdirSync(out, { recursive: true });

  const built = await esbuild.build({
    entryPoints: [resolve(here, process.env.PROBE === 'render' ? 'render.ts' : process.env.PROBE ? 'probe.ts' : 'inpage.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    outfile: resolve(out, 'harness.js'),
    alias: { '@': resolve(root, 'src') },
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  if (built.errors.length) {
    console.error(built.errors);
    process.exit(1);
  }

  writeFileSync(resolve(out, 'index.html'), PAGE);

  const run = spawnSync(
    'chromium',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--allow-file-access-from-files',
      '--virtual-time-budget=180000',
      '--dump-dom',
      `file://${resolve(out, 'index.html')}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000 },
  );

  const dom = run.stdout ?? '';
  const log = /<pre id="log">([\s\S]*?)<\/pre>/.exec(dom);
  if (!log) {
    console.error('no output from the browser');
    console.error(dom.slice(0, 4000));
    console.error(run.stderr?.slice(0, 4000) ?? '');
    process.exit(1);
  }
  const text = log[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  console.log(text);

  // write the sprites out so they can actually be looked at
  const sprites = /<script type="application\/json" id="probe-pngs">([\s\S]*?)<\/script>/.exec(dom)
    ?? /<script type="application\/json" id="sprites">([\s\S]*?)<\/script>/.exec(dom);
  if (sprites) {
    const decoded = JSON.parse(
      sprites[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    ) as { name: string; width: number; height: number; png: string }[];
    const dir = resolve(out, 'sprites');
    mkdirSync(dir, { recursive: true });
    for (const s of decoded) {
      writeFileSync(resolve(dir, `${s.name}.png`), Buffer.from(s.png, 'base64'));
    }
    console.log(`\n${decoded.length} sprites written to ${outDir}/sprites/`);
  } else {
    console.error('the page returned no sprites');
  }

  if (/FAILED/.test(text)) process.exitCode = 1;
}
