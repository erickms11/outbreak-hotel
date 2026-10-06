import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5173;
const HOST = '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

const server = http.createServer((req, res) => {
  // CORS para permitir recursos locais
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Decodifica a URL e remove parâmetros de busca
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  if (pathname.includes('bd97ead0_7a82_44af_8d0b_80c552157a6d.png')) {
    pathname = '/assets/models/jane/bd97ead0_7a82_44af_8d0b_80c552157a6d.png';
  }

  // Resolução flexível para os modelos FBX de trajes (Jake e Jane)
  const lowerPath = pathname.toLowerCase();
  for (const charName of ['jake', 'jane']) {
    for (let oNum = 2; oNum <= 4; oNum++) {
      if (lowerPath.includes(`${charName}_outfit${oNum}.fbx`)) {
        const outfitCandidates = [
          path.join(__dirname, 'assets', 'models', charName, `${charName}_outfit${oNum}.fbx`),
          path.join(__dirname, 'assets', 'models', `${charName}_outfit${oNum}.fbx`),
          path.join(__dirname, 'assets', 'models', charName, `outfit_${oNum}.fbx`),
          path.join(__dirname, 'assets', 'models', charName, `outfit${oNum}.fbx`),
        ];
        for (const cand of outfitCandidates) {
          if (fs.existsSync(cand)) {
            pathname = '/' + path.relative(__dirname, cand).replace(/\\/g, '/');
            break;
          }
        }
      }
    }
  }

  // Previne Directory Traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  // Verifica se o caminho está dentro do diretório raiz
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Proibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Arquivo não encontrado: ' + pathname);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  \x1b[36m➜\x1b[0m  \x1b[1mOffice 3D Dev Server\x1b[0m: \x1b[36mhttp://${HOST}:${PORT}/\x1b[0m\n`);
});
