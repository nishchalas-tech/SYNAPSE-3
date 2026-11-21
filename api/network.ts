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
} from '../server/networkCore.js';

interface ServerlessReq {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  json: (payload: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

function getActionPath(req: ServerlessReq): string {
  const qAction = req.query?.action;
  if (typeof qAction === 'string' && qAction.trim()) {
    return qAction.replace(/^\/+|\/+$/g, '');
  }
  if (Array.isArray(qAction) && qAction.length > 0) {
    return qAction.join('/').replace(/^\/+|\/+$/g, '');
  }
  try {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const searchAction = parsedUrl.searchParams.get('action');
    if (searchAction && searchAction.trim()) {
      return searchAction.replace(/^\/+|\/+$/g, '');
    }
    return parsedUrl.pathname.replace(/^\/api\/network\/?/, '').replace(/^\/+|\/+$/g, '');
  } catch {
    const rawUrl = (req.url || '').split('?')[0];
    return rawUrl.replace(/^\/api\/network\/?/, '').replace(/^\/+|\/+$/g, '');
  }
}

function getHolderKeyFromReq(req: ServerlessReq): string {
  const qHolder = req.query?.holderKey;
  if (typeof qHolder === 'string') return qHolder;
  if (Array.isArray(qHolder) && qHolder.length > 0) return qHolder[0] || '';
  try {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    return parsedUrl.searchParams.get('holderKey') || '';
  } catch {
    return '';
  }
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');

  try {
    const action = getActionPath(req);
    let body: Record<string, unknown> = {};

    if (req.body && typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body) as Record<string, unknown>;
      } catch {
        res.status(400).json({ ok: false, status: 400, message: 'Invalid JSON request payload.' });
        return;
      }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body as Record<string, unknown>;
    }

    if (req.method === 'GET' && (action === 'state' || action === '')) {
      const holderKey = getHolderKeyFromReq(req);
      const result = await getNetworkSnapshot(holderKey);
      res.status(result.status).json(result);
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, status: 405, message: 'Unsupported network API route or method.' });
      return;
    }

    switch (action) {
      case 'hydrate': {
        const result = await hydrateNetworkServerState(
          body as Parameters<typeof hydrateNetworkServerState>[0]
        );
        res.status(result.status).json(result);
        return;
      }
      case 'cart/reserve': {
        const result = await reserveCartItem(body as Parameters<typeof reserveCartItem>[0]);
        res.status(result.status).json(result);
        return;
      }
      case 'cart/quantity': {
        const result = await updateCartItemQty(body as Parameters<typeof updateCartItemQty>[0]);
        res.status(result.status).json(result);
        return;
      }
      case 'orders': {
        const result = await placeNetworkOrder(body as Parameters<typeof placeNetworkOrder>[0]);
        res.status(result.status).json(result);
        return;
      }
      case 'inventory/verify': {
        const result = await verifyStoreInventory(body as Parameters<typeof verifyStoreInventory>[0]);
        res.status(result.status).json(result);
        return;
      }
      case 'pick-tasks/accept': {
        const result = await acceptStorePickTask(body as Parameters<typeof acceptStorePickTask>[0]);
        res.status(result.status).json(result);
        return;
      }
      case 'pick-tasks/reject': {
        const result = await rejectAndReassignPickTask(
          body as Parameters<typeof rejectAndReassignPickTask>[0]
        );
        res.status(result.status).json(result);
        return;
      }
      case 'demand-signals': {
        const result = await recordNetworkDemandSignal(
          body as Parameters<typeof recordNetworkDemandSignal>[0]
        );
        res.status(result.status).json(result);
        return;
      }
      case 'transfers/request': {
        const result = await createTransferRequest(body as Parameters<typeof createTransferRequest>[0]);
        res.status(result.status).json(result);
        return;
      }
      case 'transfers/decide': {
        const result = await decideTransferRequest(body as Parameters<typeof decideTransferRequest>[0]);
        res.status(result.status).json(result);
        return;
      }
      case 'reset': {
        const holderKey = typeof body.holderKey === 'string' ? body.holderKey : '';
        const result = await resetNetworkServerState(holderKey);
        res.status(result.status).json(result);
        return;
      }
      default:
        res.status(404).json({ ok: false, status: 404, message: `Unknown network action: ${action}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected network backend error.';
    console.error('Network API error:', err);
    res.status(500).json({ ok: false, status: 500, message });
  }
}
