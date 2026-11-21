import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export interface CatalogIndexEntry {
  id: string;
  name: string;
  brand: string;
  category: string;
  imageFile: string;
  descriptor: string;
}

export const CATALOG_INDEX_ENTRIES: CatalogIndexEntry[] = [
  {
    id: 'lap-mbp14',
    name: 'Apple MacBook Pro 14 (M3 Pro)',
    brand: 'Apple',
    category: 'Laptops',
    imageFile: 'product_laptop_silver_1795266014764.jpg',
    descriptor:
      'Apple MacBook Pro 14 M3 Pro silver aluminum workstation laptop Liquid Retina XDR Thunderbolt 4 HDMI',
  },
  {
    id: 'lap-x1c',
    name: 'Lenovo ThinkPad X1 Carbon Gen 12',
    brand: 'Lenovo',
    category: 'Laptops',
    imageFile: 'product_laptop_graphite_1795266015366.jpg',
    descriptor:
      'Lenovo ThinkPad X1 Carbon Gen 12 matte black graphite carbon-fiber business ultrabook laptop OLED',
  },
  {
    id: 'lap-zen14',
    name: 'ASUS Zenbook 14 OLED Evo',
    brand: 'ASUS',
    category: 'Laptops',
    imageFile: 'product_laptop_silver_1795266014764.jpg',
    descriptor:
      'ASUS Zenbook 14 OLED Evo slim anodized aluminum silver ultrabook portable coding laptop',
  },
  {
    id: 'mon-lg27',
    name: 'LG UltraFine 27" 4K IPS USB-C',
    brand: 'LG',
    category: 'Monitors',
    imageFile: 'product_monitor_studio_1795266016024.jpg',
    descriptor:
      'LG UltraFine 27 inch 4K UHD Nano IPS monitor display 90W USB-C ergonomic stand studio screen',
  },
  {
    id: 'mon-dell27',
    name: 'Dell UltraSharp U2723QE 4K Hub',
    brand: 'Dell',
    category: 'Monitors',
    imageFile: 'product_monitor_studio_1795266016024.jpg',
    descriptor:
      'Dell UltraSharp U2723QE 27 inch 4K IPS Black docking hub monitor RJ45 KVM switch USB-C display',
  },
  {
    id: 'kbd-k2pro',
    name: 'Keychron Q1 Pro 75% Mechanical',
    brand: 'Keychron',
    category: 'Keyboards',
    imageFile: 'product_keyboard_mech_1795266015738.jpg',
    descriptor:
      'Keychron Q1 Pro 75 percent CNC aluminum wireless mechanical keyboard PBT keycaps tactile developer',
  },
  {
    id: 'kbd-mxkeys',
    name: 'Logitech MX Mechanical Mini',
    brand: 'Logitech',
    category: 'Keyboards',
    imageFile: 'product_keyboard_mech_1795266015738.jpg',
    descriptor:
      'Logitech MX Mechanical Mini low-profile wireless compact tactile keyboard backlit Mac Windows',
  },
  {
    id: 'mou-mx3s',
    name: 'Logitech MX Master 3S Wireless',
    brand: 'Logitech',
    category: 'Mice',
    imageFile: 'product_mouse_ergo_1795266015782.jpg',
    descriptor:
      'Logitech MX Master 3S wireless ergonomic contoured productivity mouse MagSpeed thumb wheel silent clicks',
  },
  {
    id: 'mou-proclick',
    name: 'Razer Pro Click Mini Silent',
    brand: 'Razer',
    category: 'Mice',
    imageFile: 'product_mouse_ergo_1795266015782.jpg',
    descriptor:
      'Razer Pro Click Mini silent compact travel wireless productivity mouse hyper-speed optical',
  },
  {
    id: 'aud-wh1000',
    name: 'Sony WH-1000XM5 Wireless ANC',
    brand: 'Sony',
    category: 'Headphones',
    imageFile: 'product_headphones_anc_1795266015392.jpg',
    descriptor:
      'Sony WH-1000XM5 wireless active noise cancelling over-ear headphones matte sleek headband multipoint audio',
  },
];

const IMAGES_DIR = path.resolve(process.cwd(), 'src/assets/images');
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let cachedCatalogVectors: Map<string, number[]> | null = null;
let catalogIndexPromise: Promise<Map<string, number[]>> | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : 0;
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientGeminiError(err) || attempt === maxAttempts) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 200);
      await sleep(baseDelayMs * Math.pow(2, attempt - 1) + jitter);
    }
  }
  throw lastError;
}

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function readSafeImageBase64(imageFile: string): string {
  const resolved = path.resolve(IMAGES_DIR, imageFile);
  if (!resolved.startsWith(IMAGES_DIR + path.sep)) {
    throw new Error(`Invalid asset path: ${imageFile}`);
  }
  return fs.readFileSync(resolved).toString('base64');
}

export async function ensureCatalogEmbeddingIndex(ai: GoogleGenAI): Promise<Map<string, number[]>> {
  if (cachedCatalogVectors) return cachedCatalogVectors;
  if (catalogIndexPromise) return catalogIndexPromise;

  catalogIndexPromise = (async () => {
    const fileCache = new Map<string, string>();
    for (const entry of CATALOG_INDEX_ENTRIES) {
      if (!fileCache.has(entry.imageFile)) {
        fileCache.set(entry.imageFile, readSafeImageBase64(entry.imageFile));
      }
    }

    // Bounded concurrency (batch size 3) with exponential backoff avoids burst 503 throttling
    const map = new Map<string, number[]>();
    const batchSize = 3;
    for (let i = 0; i < CATALOG_INDEX_ENTRIES.length; i += batchSize) {
      const batch = CATALOG_INDEX_ENTRIES.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (entry) => {
          const imgBase64 = fileCache.get(entry.imageFile)!;
          const result = await withRetry(() =>
            ai.models.embedContent({
              model: 'gemini-embedding-2',
              contents: [
                entry.descriptor,
                {
                  inlineData: {
                    data: imgBase64,
                    mimeType: 'image/jpeg',
                  },
                },
              ],
            })
          );
          const values = result.embeddings?.[0]?.values;
          if (!values || values.length === 0) {
            throw new Error(`Failed to generate embedding for catalog item ${entry.id}`);
          }
          return [entry.id, l2Normalize(values)] as const;
        })
      );
      for (const [id, vec] of results) {
        map.set(id, vec);
      }
    }

    cachedCatalogVectors = map;
    return map;
  })();

  try {
    return await catalogIndexPromise;
  } catch (err) {
    catalogIndexPromise = null;
    throw err;
  }
}

export function warmCatalogEmbeddingIndex(): void {
  if (!process.env.GEMINI_API_KEY?.trim()) return;
  try {
    const ai = getAiClient();
    void ensureCatalogEmbeddingIndex(ai).catch((err) => {
      console.warn('Background visual catalog embedding warmup skipped:', err instanceof Error ? err.message : err);
    });
  } catch {
    // Key not present; skip warmup
  }
}

export function getVisualSearchHealth() {
  return {
    ok: true,
    visualSearchConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    indexedProducts: cachedCatalogVectors ? cachedCatalogVectors.size : 0,
  };
}

export interface VisualSearchHttpResult {
  status: number;
  body: Record<string, unknown>;
}

async function analyzePhotoWithFallback(
  ai: GoogleGenAI,
  cleanBase64: string,
  mimeType: string,
  textHint: string
) {
  const promptText = `Analyze this product photo for an electronics retail OpenSearch catalog query.${
    textHint ? ` Customer context hint: "${textHint}".` : ''
  } Identify the hardware object, map its category among [Laptops, Monitors, Keyboards, Mice, Headphones, Other], extract concise search keywords, and build a crisp OpenSearch query string.`;

  const baseParams = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
          { text: promptText },
        ],
      },
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedObject: { type: Type.STRING },
          category: { type: Type.STRING },
          keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          visualSummary: { type: Type.STRING },
          suggestedQuery: { type: Type.STRING },
          isElectronicsHardware: { type: Type.BOOLEAN },
        },
        required: [
          'detectedObject',
          'category',
          'keywords',
          'visualSummary',
          'suggestedQuery',
          'isElectronicsHardware',
        ],
      },
    },
  };

  try {
    return await withRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          ...baseParams,
        }),
      2,
      450
    );
  } catch (err) {
    if (!isTransientGeminiError(err)) {
      throw err;
    }
    // Fallback to Gemini Flash Lite if primary vision model is experiencing high demand (503/429)
    return await withRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: baseParams.contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: baseParams.config.responseSchema,
          },
        }),
      2,
      450
    );
  }
}

export async function executeVisualSearchRequest(rawBody: unknown): Promise<VisualSearchHttpResult> {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as {
    imageBase64?: unknown;
    mimeType?: unknown;
    textHint?: unknown;
  };

  if (typeof body.imageBase64 !== 'string' || !body.imageBase64.trim()) {
    return {
      status: 400,
      body: { error: 'An image upload is required for visual search.' },
    };
  }

  const rawMime = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      status: 400,
      body: { error: 'Unsupported image format. Upload JPEG, PNG, or WebP.' },
    };
  }

  const cleanBase64 = body.imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
  const approxBytes = Buffer.from(cleanBase64, 'base64').byteLength;
  if (approxBytes === 0 || approxBytes > MAX_IMAGE_BYTES) {
    return {
      status: 400,
      body: { error: 'Image file must be non-empty and under 8 MB.' },
    };
  }

  const textHint = typeof body.textHint === 'string' ? body.textHint.trim().slice(0, 140) : '';

  let ai: GoogleGenAI;
  try {
    ai = getAiClient();
  } catch {
    return {
      status: 503,
      body: {
        error:
          'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets (or Vercel Environment Variables) to enable live visual search.',
      },
    };
  }

  try {
    const queryContents: Array<string | { inlineData: { data: string; mimeType: string } }> = [
      {
        inlineData: {
          data: cleanBase64,
          mimeType,
        },
      },
    ];
    if (textHint) {
      queryContents.unshift(textHint);
    }

    const startedAt = Date.now();
    const [catalogIndex, queryEmbedRes, analysisRes] = await Promise.all([
      ensureCatalogEmbeddingIndex(ai),
      withRetry(() =>
        ai.models.embedContent({
          model: 'gemini-embedding-2',
          contents: queryContents,
        })
      ),
      analyzePhotoWithFallback(ai, cleanBase64, mimeType, textHint),
    ]);

    console.info(`[visual-search] completed in ${Date.now() - startedAt}ms`);

    const rawQueryVec = queryEmbedRes.embeddings?.[0]?.values;
    if (!rawQueryVec || rawQueryVec.length === 0) {
      return {
        status: 502,
        body: { error: 'Gemini embedding model returned an empty vector.' },
      };
    }

    const queryVec = l2Normalize(rawQueryVec);
    const vectorScores = Array.from(catalogIndex.entries())
      .map(([productId, productVec]) => ({
        productId,
        cosineSimilarity: Number(Math.max(0, cosineSimilarity(queryVec, productVec)).toFixed(4)),
      }))
      .sort((a, b) => b.cosineSimilarity - a.cosineSimilarity);

    let visualAnalysis = {
      detectedObject: 'Hardware item',
      category: 'Other',
      keywords: [] as string[],
      visualSummary: 'Visual attributes extracted from uploaded image.',
      suggestedQuery: textHint || 'electronics',
      isElectronicsHardware: true,
    };

    if (analysisRes.text) {
      try {
        visualAnalysis = JSON.parse(analysisRes.text);
      } catch {
        // Keep structured fallback derived only from query if JSON parse fails
      }
    }

    return {
      status: 200,
      body: {
        embeddingDimensions: queryVec.length,
        indexedCatalogSize: catalogIndex.size,
        visualAnalysis,
        vectorScores,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Visual search failed.';
    console.error('Visual search endpoint error:', err);
    return {
      status: 502,
      body: {
        error: `Visual search request failed: ${message}`,
      },
    };
  }
}
