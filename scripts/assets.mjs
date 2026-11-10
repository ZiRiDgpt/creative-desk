import { readFileSync } from 'node:fs';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/mark.svg': ['mark.svg', 'image/svg+xml'],
  '/sample.svg': ['sample.svg', 'image/svg+xml'],
};

export function readAssets() {
  return Object.fromEntries(Object.entries(files).map(([route, [filename, type]]) => [
    route, [type, readFileSync(new URL('../public/' + filename, import.meta.url), 'utf8')],
  ]));
}
