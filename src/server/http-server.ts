import http, { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { Bot, Context, webhookCallback } from 'grammy';
import { logger } from '../shared/logger';

export interface HttpServerOptions {
  bot: Bot<Context>;
  webhookSecret?: string;
  webhookPath?: string;
  timeoutMilliseconds?: number;
}

export function timingSafeCompare(incoming?: string | string[], expected?: string): boolean {
  if (!incoming || !expected) {
    return false;
  }
  const token = Array.isArray(incoming) ? incoming[0] : incoming;
  const tokenBuf = Buffer.from(token, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');

  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

export function createHttpServer(options: HttpServerOptions): http.Server {
  const webhookPath = options.webhookPath ?? '/telegram/webhook';
  const webhookHandler = webhookCallback(options.bot, 'http', {
    secretToken: options.webhookSecret,
    timeoutMilliseconds: options.timeoutMilliseconds ?? 10_000,
    onTimeout: 'throw',
  });

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const host = req.headers.host ?? 'localhost';
      const parsedUrl = new URL(req.url ?? '/', `http://${host}`);

      // Health Check endpoint
      if (parsedUrl.pathname === '/health') {
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET' });
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }
        return;
      }

      // Telegram Webhook endpoint
      if (parsedUrl.pathname === webhookPath) {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        // Validate webhook secret token before processing
        if (options.webhookSecret) {
          const incomingToken = req.headers['x-telegram-bot-api-secret-token'];
          if (!timingSafeCompare(incomingToken, options.webhookSecret)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized: invalid secret token' }));
            return;
          }
        }

        try {
          await webhookHandler(req, res);
        } catch (webhookError) {
          logger.error('Error handling Telegram webhook update:', webhookError);
          if (!res.headersSent) {
            if (webhookError instanceof SyntaxError) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Malformed request: invalid JSON' }));
            } else {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
          }
        }
        return;
      }

      // Not Found for any other route
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    } catch (unexpectedError) {
      logger.error('Unexpected error in HTTP server request handler:', unexpectedError);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  });

  return server;
}
