// Журнал игры (только dev): страница шлёт события пачками в /api/log, сервер дописывает их в logs/play-<дата>.jsonl.
// Папку logs не отслеживаем, иначе каждая запись перезагружала бы страницу.
import { appendFile, mkdir } from 'node:fs/promises';

const playLog = () => ({
  name: 'play-log',
  configureServer(server) {
    server.middlewares.use('/api/log', async (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
      let body = '';
      for await (const c of req) { body += c; if (body.length > 2e6) { res.statusCode = 413; return res.end(); } }
      try {
        const { session, events } = JSON.parse(body);
        if (!Array.isArray(events)) throw new Error('events');
        await mkdir(new URL('./logs/', import.meta.url), { recursive: true });
        const day = new Date().toLocaleDateString('sv'); // местная дата, ГГГГ-ММ-ДД
        await appendFile(new URL(`./logs/play-${day}.jsonl`, import.meta.url), events.map((e) => JSON.stringify({ session, ...e })).join('\n') + '\n');
        res.end('ok');
      } catch { res.statusCode = 400; res.end(); }
    });
  },
});

export default { plugins: [playLog()], server: { watch: { ignored: ['**/logs/**', '**/test-out/**', '**/backup/**'] } } };
