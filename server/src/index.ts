// Servidor Node: HTTP (/health e arquivos estáticos do build) + WebSocket (/ws)
// na mesma porta. No Render a porta vem em process.env.PORT.
import { promises as fs } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { attachClient } from './connection';
import { startGameLoop } from './gameLoop';
import { Lobby } from './lobby';

const PORT = Number(process.env.PORT) || 3000;
/** Pasta com o build do Vite (gerado por "npm run build"). */
const DIST = path.resolve(process.cwd(), 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  try {
    let file = path.join(DIST, decodeURIComponent(pathname));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, 'index.html');
    } catch {
      file = path.join(DIST, 'index.html'); // fallback para a página do jogo
    }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Build não encontrado. Rode "npm run build" ou use "npm run dev".');
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  void serveStatic(url.pathname, res);
});

const lobby = new Lobby();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws) => attachClient(ws, lobby));

startGameLoop(lobby);

server.listen(PORT, () => {
  console.log(`Brasa Arena rodando na porta ${PORT}`);
});
