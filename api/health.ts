import { getVisualSearchHealth } from '../server/visualSearchCore.js';

interface ServerlessReq {
  method?: string;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  json: (payload: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

export default function handler(_req: ServerlessReq, res: ServerlessRes) {
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');
  res.status(200).json(getVisualSearchHealth());
}
