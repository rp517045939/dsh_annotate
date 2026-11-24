import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.argv[2] || 4180)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  let file = decodeURIComponent(url.pathname)
  if (file === '/' || file === '') file = '/mock/index.html'
  const target = path.join(root, file)
  if (!target.startsWith(root)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  fs.readFile(target, (error, data) => {
    if (error) {
      res.writeHead(404)
      res.end('not found: ' + file)
      return
    }
    res.writeHead(200, {
      'content-type': types[path.extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(data)
  })
}).listen(port, '127.0.0.1', () => {
  console.log('annotate dev server: http://127.0.0.1:' + port + '/mock/index.html')
  console.log('dom harness:        http://127.0.0.1:' + port + '/test/dom-harness.html')
})
