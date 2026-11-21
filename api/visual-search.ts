import { executeVisualSearchRequest } from '../server/visualSearchCore.js';

interface ServerlessReq {
  method?: string;
  body?: unknown;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {
        res.status(400).json({ error: 'Invalid JSON request payload.' });
        return;
      }
    }

    const result = await executeVisualSearchRequest(parsedBody);
    res.status(result.status).json(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected visual search error.';
    console.error('Visual search API error:', err);
    res.status(500).json({ error: message });
  }
}
