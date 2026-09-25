// Übernimmt den fertigen Einbettungs-Build von Mustikka Hyppy nach dist/games/hyppy/.
//
//   cd ../mustikka-hyppy && npm install && npm run build:embed
//   cd ../suomi-satztrainer && node scripts/update-hyppy.mjs ../mustikka-hyppy
//
// Kopiert: mustikka-hyppy.js, Grafiken, Schrift, Wortliste (CC0), Vorschaubild, Lizenzen.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.resolve(process.argv[2] || path.join(root, '..', 'mustikka-hyppy'));
const build = path.join(game, 'dist-embed');
const target = path.join(root, 'dist', 'games', 'hyppy');
if (!fs.existsSync(path.join(build, 'mustikka-hyppy.js'))) {
  console.error(`Kein Build gefunden: ${build}\nZuerst im Spiel-Repo „npm run build:embed“ ausführen.`);
  process.exit(1);
}
fs.rmSync(target, {recursive: true, force: true});
fs.mkdirSync(target, {recursive: true});
for (const entry of fs.readdirSync(build)) fs.cpSync(path.join(build, entry), path.join(target, entry), {recursive: true});
fs.copyFileSync(path.join(game, 'vocab', 'de-fi-grundwortschatz.json'), path.join(target, 'words-de-fi.json'));
fs.copyFileSync(path.join(game, 'art', 'cover.png'), path.join(target, 'cover.png'));
const phaserLicense = path.join(game, 'node_modules', 'phaser', 'LICENSE.md');
const licenses = [
  'Mustikka Hyppy – eingebettet im Suomi-Satztrainer',
  '',
  'Phaser (https://phaser.io) – MIT License:',
  fs.existsSync(phaserLicense) ? fs.readFileSync(phaserLicense, 'utf8') : 'Copyright (c) 2013-2025 Phaser Studio Inc.',
  '',
  'Schrift Patrick Hand – SIL Open Font License 1.1, siehe fonts/OFL-Patrick-Hand.txt',
  'Wortliste words-de-fi.json – CC0 1.0 (eigener Grundwortschatz)',
].join('\n');
fs.writeFileSync(path.join(target, 'LICENSES.txt'), licenses + '\n');
const size = dir => fs.readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`Mustikka Hyppy übernommen nach dist/games/hyppy (${(size(target) / 1e6).toFixed(1)} MB)`);
