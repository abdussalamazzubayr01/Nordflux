const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public');

function copyFile(sourceRelative, targetRelative) {
  const source = path.join(root, sourceRelative);
  if (!fs.existsSync(source)) return;

  const target = path.join(outDir, targetRelative || sourceRelative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(sourceRelative, targetRelative, shouldInclude) {
  const source = path.join(root, sourceRelative);
  if (!fs.existsSync(source)) return;

  const target = path.join(outDir, targetRelative || sourceRelative);
  fs.cpSync(source, target, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(root, entry).replace(/\\/g, '/');
      return shouldInclude ? shouldInclude(relative) : true;
    }
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

copyFile('index.html');
copyFile('robots.txt');
copyFile('sitemap.xml');
copyFile('email-preview.html');

copyDirectory('html');
copyDirectory('assets', 'assets', (relative) => relative !== 'assets/js/server.js');

console.log('Static site built into public/');
