import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function smmApiProxyPlugin() {
  return {
    name: 'smm-api-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/smm/services', async (req: any, res: any) => {
        try {
          const targetUrl = 'https://my.smmgen.com/api/v2?key=abb6b46205ede0b57a7c53580646fc7a&action=services';
          const response = await fetch(targetUrl);
          const text = await response.text();
          res.setHeader('Content-Type', 'application/json');
          res.end(text);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Services fetch failed' }));
        }
      });

      server.middlewares.use('/api/smm/order', async (req: any, res: any) => {
        try {
          if (req.method === 'GET') {
            const urlObj = new URL(req.url, 'http://localhost');
            const targetBase = 'https://my.smmgen.com/api/v2';
            const targetUrl = `${targetBase}${urlObj.search}`;
            const response = await fetch(targetUrl);
            const text = await response.text();
            res.setHeader('Content-Type', 'application/json');
            res.end(text);
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                const { service, link, quantity, apiKey, apiBase } = JSON.parse(body);
                const targetBase = apiBase || 'https://my.smmgen.com/api/v2';
                const params = new URLSearchParams({
                  key: apiKey || 'abb6b46205ede0b57a7c53580646fc7a',
                  action: 'add',
                  service: String(service),
                  link: String(link),
                  quantity: String(quantity)
                });

                const targetUrl = `${targetBase}?${params.toString()}`;
                const response = await fetch(targetUrl);
                const text = await response.text();
                res.setHeader('Content-Type', 'application/json');
                res.end(text);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || 'Server proxy failed' }));
              }
            });
            return;
          }

          res.statusCode = 405;
          res.end('Method Not Allowed');
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Server proxy failed' }));
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), smmApiProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
