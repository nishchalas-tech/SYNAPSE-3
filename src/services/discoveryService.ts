import type { InventoryRecord, Product, Store } from '../types';
import type {
  OpenSearchQueryParams,
  OpenSearchResult,
  VisualSearchApiResponse,
  VisualSearchMatch,
} from './aivenInterfaces';

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const SYNONYM_MAP: Record<string, string[]> = {
  macbok: ['macbook', 'apple'],
  mac: ['macbook', 'apple', 'usb-c'],
  notebook: ['laptop', 'ultrabook', 'thinkpad', 'zenbook'],
  screen: ['monitor', 'display', '4k', 'ips'],
  display: ['monitor', '4k', 'ips', 'oled'],
  quiet: ['silent', 'anc', 'noise'],
  ergo: ['ergonomic', 'mx'],
  earphones: ['headphones', 'anc'],
  headset: ['headphones', 'anc'],
  coding: ['developer', 'thinkpad', 'mechanical', 'keychron'],
  programing: ['developer', 'mechanical', 'laptop'],
  mechanical: ['keychron', 'keyboard'],
};

const STOPWORDS = new Set(['for', 'with', 'and', 'the', 'a', 'an', 'in', 'to', 'of', 'best', 'good']);

export function inferCategoryFromQuery(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('laptop') || q.includes('macbook') || q.includes('thinkpad') || q.includes('zenbook')) {
    return 'Laptops';
  }
  if (q.includes('monitor') || q.includes('4k') || q.includes('screen') || q.includes('display')) {
    return 'Monitors';
  }
  if (q.includes('keyboard') || q.includes('keychron') || q.includes('mechanical')) {
    return 'Keyboards';
  }
  if (q.includes('mouse') || q.includes('mice') || q.includes('ergo')) {
    return 'Mice';
  }
  if (q.includes('headphone') || q.includes('headset') || q.includes('anc') || q.includes('sony')) {
    return 'Headphones';
  }
  return 'Unclassified';
}

export function searchCatalog(
  products: Product[],
  inventory: InventoryRecord[],
  stores: Store[],
  params: OpenSearchQueryParams
): OpenSearchResult {
  const rawQuery = params.query.trim();
  const normalizedQuery = rawQuery.toLowerCase();
  const rawTokens = normalizedQuery
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9-]/g, ''))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

  const expandedTokens = rawTokens.flatMap((token) => [token, ...(SYNONYM_MAP[token] || [])]);

  const scored = products
    .filter((product) => {
      if (params.category && params.category !== 'All' && product.category !== params.category) {
        return false;
      }
      if (params.minPriceInr !== undefined && product.priceInr < params.minPriceInr) {
        return false;
      }
      if (params.maxPriceInr !== undefined && product.priceInr > params.maxPriceInr) {
        return false;
      }
      if (params.city && params.city !== 'All') {
        const cityStores = stores.filter((s) => s.city === params.city).map((s) => s.id);
        const hasAnyCityRecord = inventory.some(
          (inv) => inv.productId === product.id && cityStores.includes(inv.storeId)
        );
        if (!hasAnyCityRecord) return false;
      }
      return true;
    })
    .map((product) => {
      if (rawTokens.length === 0) {
        return { product, relevanceScore: 1, matchedTerms: [] as string[] };
      }

      const searchableText = [
        product.name,
        product.brand,
        product.category,
        product.description,
        product.compatibilityLabel,
        ...product.tags,
        ...product.specs.map((s) => `${s.label} ${s.value}`),
      ]
        .join(' ')
        .toLowerCase();

      const words = searchableText.split(/[^a-z0-9-]+/).filter(Boolean);
      let score = 0;
      const matchedTerms = new Set<string>();

      for (const token of expandedTokens) {
        if (product.name.toLowerCase().includes(token)) {
          score += 5;
          matchedTerms.add(token);
          continue;
        }
        if (product.brand.toLowerCase() === token || product.category.toLowerCase().includes(token)) {
          score += 4;
          matchedTerms.add(token);
          continue;
        }
        if (searchableText.includes(token)) {
          score += 2.5;
          matchedTerms.add(token);
          continue;
        }

        // Typo tolerance via bounded Levenshtein distance
        if (token.length >= 4) {
          const maxDistance = token.length >= 7 ? 2 : 1;
          for (const word of words) {
            if (Math.abs(word.length - token.length) <= maxDistance) {
              const dist = levenshtein(token, word);
              if (dist <= maxDistance) {
                score += 2;
                matchedTerms.add(word);
                break;
              }
            }
          }
        }
      }

      return {
        product,
        relevanceScore: score,
        matchedTerms: Array.from(matchedTerms),
      };
    })
    .filter((entry) => (rawTokens.length === 0 ? true : entry.relevanceScore > 0));

  const sortBy = params.sortBy || 'relevance';
  scored.sort((a, b) => {
    if (sortBy === 'price_asc') return a.product.priceInr - b.product.priceInr;
    if (sortBy === 'price_desc') return b.product.priceInr - a.product.priceInr;
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return a.product.priceInr - b.product.priceInr;
  });

  return {
    products: scored,
    total: scored.length,
  };
}

export function getSearchSuggestions(products: Product[], prefix: string): string[] {
  const clean = prefix.trim().toLowerCase();
  const curatedPrompts = [
    'MacBook Pro 14 M3',
    '4K USB-C monitor for Mac',
    'Silent ergonomic wireless mouse',
    'Wireless mechanical keyboard',
    'Sony ANC headphones',
    'ThinkPad X1 Carbon',
  ];

  if (!clean) return curatedPrompts.slice(0, 5);

  const productMatches = products
    .filter(
      (p) =>
        p.name.toLowerCase().includes(clean) ||
        p.brand.toLowerCase().includes(clean) ||
        p.tags.some((t) => t.includes(clean))
    )
    .map((p) => p.name);

  const promptMatches = curatedPrompts.filter((s) => s.toLowerCase().includes(clean));
  return Array.from(new Set([...productMatches, ...promptMatches])).slice(0, 6);
}

export async function executeVisualSearch(payload: {
  imageBase64: string;
  mimeType: string;
  textHint?: string;
}): Promise<VisualSearchApiResponse> {
  const res = await fetch('/api/visual-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let data: (VisualSearchApiResponse & { error?: string }) | null = null;
  try {
    data = rawText ? (JSON.parse(rawText) as VisualSearchApiResponse & { error?: string }) : null;
  } catch {
    const trimmed = rawText.trim().toLowerCase();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      throw new Error(
        'Visual search backend route (/api/visual-search) returned HTML instead of JSON. Ensure the API server or Vercel serverless function is deployed with GEMINI_API_KEY configured.'
      );
    }
    throw new Error(`Visual search returned an unexpected response (HTTP ${res.status}).`);
  }

  if (!res.ok || !data) {
    throw new Error(data?.error || `Visual search failed with status ${res.status}`);
  }
  return data;
}

export function combineVisualAndOpenSearch(
  products: Product[],
  inventory: InventoryRecord[],
  stores: Store[],
  apiResponse: VisualSearchApiResponse
): {
  matches: VisualSearchMatch[];
  isUnmatched: boolean;
} {
  const { visualAnalysis, vectorScores } = apiResponse;
  const openSearchQuery = [visualAnalysis.suggestedQuery, ...visualAnalysis.keywords]
    .filter(Boolean)
    .join(' ');

  const lexicalRes = searchCatalog(products, inventory, stores, {
    query: openSearchQuery,
    city: 'Bengaluru',
    sortBy: 'relevance',
  });

  const maxLexical = Math.max(
    1,
    ...lexicalRes.products.map((entry) => entry.relevanceScore)
  );
  const lexicalById = new Map(
    lexicalRes.products.map((entry) => [entry.product.id, entry])
  );
  const vectorById = new Map(
    vectorScores.map((v) => [v.productId, v.cosineSimilarity])
  );

  const ranked: VisualSearchMatch[] = products
    .map((product) => {
      const visualSimilarity = vectorById.get(product.id) ?? 0;
      const lexicalEntry = lexicalById.get(product.id);
      const rawLex = lexicalEntry ? lexicalEntry.relevanceScore / maxLexical : 0;
      const categoryBonus =
        visualAnalysis.category.toLowerCase() === product.category.toLowerCase() ? 0.15 : 0;
      const openSearchScore = Math.min(1, Number((rawLex * 0.85 + categoryBonus).toFixed(4)));
      const hybridScore = Number((visualSimilarity * 0.6 + openSearchScore * 0.4).toFixed(4));

      return {
        product,
        visualSimilarity,
        openSearchScore,
        hybridScore,
        matchedTerms: lexicalEntry?.matchedTerms || [],
      };
    })
    .sort((a, b) => b.hybridScore - a.hybridScore);

  const top = ranked[0];
  const isUnmatched =
    !visualAnalysis.isElectronicsHardware || !top || top.hybridScore < 0.36;

  return {
    matches: isUnmatched ? [] : ranked.filter((m) => m.hybridScore >= 0.36).slice(0, 6),
    isUnmatched,
  };
}

