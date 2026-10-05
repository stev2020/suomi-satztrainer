// Every page's Content-Security-Policy must list the exact SHA-256 hash of each
// of its inline scripts. If an inline script is edited without updating the
// hash, the browser blocks it silently (e.g. no theme before first paint).
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const pages=['index.html','datenschutz.html','impressum.html','unterstuetzen.html'];
for(const page of pages){
  const html=fs.readFileSync(new URL('../dist/'+page,import.meta.url),'utf8');
  const meta=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert(meta,`${page}: CSP meta tag present`);
  assert(html.indexOf(meta[0])<html.indexOf('<script'),`${page}: CSP comes before the first script`);
  const policy=meta[1],scriptSrc=(policy.match(/script-src ([^;]+)/)||[])[1]||'';
  const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  for(const hash of inline)assert(scriptSrc.includes(hash),`${page}: inline script hash ${hash} is listed in script-src`);
  const listed=scriptSrc.match(/'sha256-[^']+'/g)||[];
  assert.equal(listed.length,inline.length,`${page}: no stale hashes in script-src`);
  assert(!/unsafe-eval/.test(policy),`${page}: no unsafe-eval`);
  assert(!/script-src[^;]*unsafe-inline/.test(policy),`${page}: no unsafe-inline scripts`);
  assert(!/<[^>]+\son[a-z]+=/i.test(html),`${page}: no inline event handlers`);
}
console.log(`PASS: CSP present with matching inline-script hashes on ${pages.length} pages.`);
