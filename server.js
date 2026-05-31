import http from 'node:http'
import fs from 'node:fs'

const types = {
  js: 'application/javascript',
  json: 'application/json',
  html: 'text/html',
  css: 'text/css'
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname === '/' ? '/index.html' : url.pathname
  const ext = path.split('.').slice(-1)[0]
  const type = types[ext] || 'application/octet-stream'
  if (!fs.existsSync(`.${path}`)) {
    res.writeHead(404, {
      'Content-Type': 'text/plain',
      // enable cors
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end('Not found')
    return
  }

  const content = fs.readFileSync(`.${path}`)
  res.writeHead(200, {
    'Content-Type': type,
    // enable cors
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(content)
}).listen(3846, () => {
  console.log('Server running at http://localhost:3846/')
})
