import fs from 'node:fs'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import os from 'node:os'

const [root, page, out, chromePort = '9733', httpPort = '8791'] = process.argv.slice(2)
const types = { '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const srv = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname))
  if (!p.startsWith(path.resolve(root)) || !fs.existsSync(p)) { r.writeHead(404); return r.end() }
  r.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(r)
}).listen(+httpPort, '127.0.0.1')
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-print-'))
const ch = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${chromePort}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let tgt
for (let i = 0; i < 50 && !tgt; i++) { await sleep(300); try { tgt = (await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()).find((t) => t.type === 'page') } catch {} }
const ws = new WebSocket(tgt.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const wait = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable')
await send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/${page}` }); await sleep(4000)
const r = await send('Page.printToPDF', { paperWidth: 8.5, paperHeight: 11, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, preferCSSPageSize: true })
fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'))
ws.close(); ch.kill(); srv.close(); await sleep(500); console.log('ok', out); process.exit(0)
