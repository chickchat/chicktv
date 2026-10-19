import fs from 'node:fs/promises';
import path from 'node:path';
const [directory, version] = process.argv.slice(2);
if (!directory || !/^[a-zA-Z0-9_-]{1,100}$/.test(version || '')) throw Error('Expected output directory and release ID');
async function visit(folder) {
  for (const item of await fs.readdir(folder, {withFileTypes:true})) {
    const target = path.join(folder, item.name);
    if (item.isDirectory()) { await visit(target); continue; }
    if (!item.name.endsWith('.html')) continue;
    let html = await fs.readFile(target, 'utf8');
    html = html.replace(/<(script|link)\b[^>]*>/gi, tag => tag.replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (attribute, name, quote, value) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) || !/\.(?:js|css)(?:[?#]|$)/i.test(value)) return attribute;
      const localPath = value.split(/[?#]/)[0];
      const url = new URL(value, 'https://build.invalid/');
      url.searchParams.set('v', version);
      return name + '=' + quote + localPath + url.search + url.hash + quote;
    }));
    await fs.writeFile(target, html);
  }
}
await visit(directory);
console.log('Versioned website release ' + version);
