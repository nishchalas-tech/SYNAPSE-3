import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import {
  acceptStorePickTask,
  createTransferRequest,
  decideTransferRequest,
  getNetworkSnapshot,
  hydrateNetworkServerState,
  placeNetworkOrder,
  recordNetworkDemandSignal,
  rejectAndReassignPickTask,
  reserveCartItem,
  resetNetworkServerState,
  updateCartItemQty,
  verifyStoreInventory,
} from './server/networkCore.js';
import {
  executeVisualSearchRequest,
  getVisualSearchHealth,
  warmCatalogEmbeddingIndex,
} from './server/visualSearchCore.js';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json(getVisualSearchHealth());
  });

  app.post('/api/visual-search', async (req, res) => {
    const result = await executeVisualSearchRequest(req.body);
    res.status(result.status).json(result.body);
  });

  app.get('/api/network/state', async (req, res) => {
    const holderKey = typeof req.query.holderKey === 'string' ? req.query.holderKey : '';
    const result = await getNetworkSnapshot(holderKey);
    res.status(result.status).json(result);
  });

  app.post('/api/network/hydrate', async (req, res) => {
    const result = await hydrateNetworkServerState(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/cart/reserve', async (req, res) => {
    const result = await reserveCartItem(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/cart/quantity', async (req, res) => {
    const result = await updateCartItemQty(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/orders', async (req, res) => {
    const result = await placeNetworkOrder(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/inventory/verify', async (req, res) => {
    const result = await verifyStoreInventory(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/pick-tasks/accept', async (req, res) => {
    const result = await acceptStorePickTask(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/pick-tasks/reject', async (req, res) => {
    const result = await rejectAndReassignPickTask(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/demand-signals', async (req, res) => {
    const result = await recordNetworkDemandSignal(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/transfers/request', async (req, res) => {
    const result = await createTransferRequest(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/transfers/decide', async (req, res) => {
    const result = await decideTransferRequest(req.body || {});
    res.status(result.status).json(result);
  });

  app.post('/api/network/reset', async (req, res) => {
    const holderKey = typeof req.body?.holderKey === 'string' ? req.body.holderKey : '';
    const result = await resetNetworkServerState(holderKey);
    res.status(result.status).json(result);
  });

  // Ensure Express body-parser errors (e.g. 413 PayloadTooLargeError) return JSON, never HTML
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 400;
      const message =
        status === 413
          ? 'Uploaded image payload exceeded server limit. Try a smaller photo under 8 MB.'
          : err instanceof Error
            ? err.message
            : 'Invalid API request.';
      res.status(status).json({ error: message });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`SYNAPSE server listening on http://0.0.0.0:${port}`);
    warmCatalogEmbeddingIndex();
  });
}

void startServer();
