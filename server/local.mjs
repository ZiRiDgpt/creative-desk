import { createServer } from 'node:http';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createApp, maxRequestSize } from './app.mjs';
import { readAssets } from '../scripts/assets.mjs';

const port = Number(process.env.PORT ?? '3030');
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = resolve(process.env.DESK_DATA_DIR ?? 'data');
mkdirSync(dataDir, { recursive: true });
const sql = new DatabaseSync(resolve(dataDir, 'desk.sqlite'));
sql.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
const migrations = new URL('../drizzle/', import.meta.url);
for (const [index, file] of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort().entries()) {
  sql.exec('BEGIN IMMEDIATE');
  try {
    if (sql.prepare('PRAGMA user_version').get().user_version <= index) {
      sql.exec(readFileSync(new URL(file, migrations), 'utf8'));
      sql.exec(`PRAGMA user_version = ${index + 1}`);
    }
    sql.exec('COMMIT');
  } catch (error) {
    sql.exec('ROLLBACK');
    throw error;
  }
}

const db = {
  prepare(query) {
    const statement = sql.prepare(query);
    return {
      bind: (...args) => ({
        first: () => statement.get(...args) ?? null,
        all: () => ({ results: statement.all(...args) }),
        run: () => ({ meta: statement.run(...args) }),
      }),
      first: () => statement.get() ?? null,
      all: () => ({ results: statement.all() }),
    };
  },
  batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => statement.run());
      sql.exec('COMMIT');
      return results;
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  },
};

const handle = createApp(readAssets(), { isolated: process.env.DESK_ISOLATED === '1' });

createServer(async (incoming, outgoing) => {
  try {
    const method = incoming.method;
    const chunks = [];
    let size = 0;
    if (method !== 'GET' && method !== 'HEAD') {
      for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxRequestSize) {
          outgoing.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' });
          outgoing.end(JSON.stringify({ error: 'Запрос слишком большой. Файл должен быть не больше 1 МБ.' }));
          return;
        }
        chunks.push(chunk);
      }
    }
    const authority = incoming.headers.host ?? `localhost:${port}`;
    const request = new Request(new URL('http://' + authority + incoming.url), {
      method,
      headers: incoming.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const response = await handle(request, db);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
}).listen(port, host, () => console.log(`Creative Desk • http://${host}:${port}`));
