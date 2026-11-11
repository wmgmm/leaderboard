// Builds the browser pages into dist/web and the server into dist/server.mjs.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';

mkdirSync('dist/web', { recursive: true });
await build({
  entryPoints: ['web/src/attendee.ts', 'web/src/projector.ts', 'web/src/facilitator.ts'],
  bundle: true,
  target: 'es2017', // old browsers on locked-down work laptops
  outdir: 'dist/web',
  minify: true,
  sourcemap: true,
});
for (const file of readdirSync('web')) {
  if (/\.(html|css|json|svg|png)$/.test(file)) cpSync(`web/${file}`, `dist/web/${file}`);
}
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/server.mjs',
});
console.log('built dist/web and dist/server.mjs');
