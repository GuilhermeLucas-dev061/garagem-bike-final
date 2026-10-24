/* Inicia o servidor local.  Uso: npm start   (abre em http://localhost:3000) */

const http = require('http');
const { handle } = require('./app');
const storage = require('./storage');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);

http.createServer(handle).listen(PORT, HOST, async () => {
  console.log(`Garagem Bike rodando em http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT} (dados: ${storage.mode === 'redis' ? 'Redis' : 'arquivos em data/'})`);
  try {
    if (!(await storage.loadUsers()).length) console.log('Primeiro acesso: abra o endereço acima e crie a conta do dono.');
  } catch (e) {
    console.error('Aviso:', e.message);
  }
});
