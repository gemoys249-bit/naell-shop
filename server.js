/* ============================================================
   Naell Shop — server realtime
   - Menyajikan naell-shop.html + aset statis
   - GET  /api/db      → ambil data terbaru (JSON)
   - POST /api/db      → simpan data & sebarkan ke semua klien (SSE)
   - GET  /api/events  → aliran data realtime (Server-Sent Events)
   Tanpa dependensi eksternal (cukup Node.js).
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8000);
const DIR = __dirname;
const DBFILE = path.join(DIR, 'naellshop-db.json');

let db = null;
try { db = JSON.parse(fs.readFileSync(DBFILE, 'utf8')); } catch (e) { db = null; }

const klien = new Set(); /* daftar koneksi SSE */

function simpanDisk(data) {
  try { fs.writeFileSync(DBFILE, JSON.stringify(data)); } catch (e) { console.error('gagal simpan', e.message); }
}
function sebar(from) {
  if (!db) return;
  const payload = 'data: ' + JSON.stringify({ from: from || null, db }) + '\n\n';
  for (const res of klien) { try { res.write(payload); } catch (e) { /* nanti dibersihkan */ } }
}

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
  '.json':'application/json; charset=utf-8','.zip':'application/zip','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  /* ---- API: data ---- */
  if (url === '/api/db') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
      res.end(JSON.stringify(db));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 25e6) req.destroy(); });
      req.on('end', () => {
        try {
          const d = JSON.parse(body);
          if (d && d.users) {
            const from = req.headers['x-client-id'] || null;
            db = d; simpanDisk(d); sebar(from);
          }
        } catch (e) { /* abaikan body rusak */ }
        res.writeHead(204, { 'Cache-Control':'no-store' }); res.end();
      });
      return;
    }
  }

  /* ---- API: aliran realtime ---- */
  if (url === '/api/events') {
    res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-store', 'Connection':'keep-alive' });
    res.write(': terhubung\n\n');
    if (db) res.write('data: ' + JSON.stringify({ from: 'init', db }) + '\n\n');
    klien.add(res);
    const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(hb); klien.delete(res); });
    return;
  }

  /* ---- statis ---- */
  const rel = url === '/' ? '/naell-shop.html' : url;
  const aman = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(DIR, aman);
  if (!file.startsWith(DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(buf);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Naell Shop realtime aktif di http://0.0.0.0:' + PORT);
});
