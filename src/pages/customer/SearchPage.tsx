import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Bell, Camera, Check, Image as ImageIcon, Loader2, Search, Upload, X } from 'lucide-react';
import { ProductCard } from '../../components/products/ProductCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import type { VisualSearchApiResponse, VisualSearchMatch } from '../../services/aivenInterfaces';
import {
  combineVisualAndOpenSearch,
  executeVisualSearch,
  getSearchSuggestions,
  inferCategoryFromQuery,
  searchCatalog,
} from '../../services/discoveryService';
import type { ProductCategory } from '../../types';

const CATEGORIES: Array<ProductCategory | 'All'> = [
  'All',
  'Laptops',
  'Monitors',
  'Keyboards',
  'Mice',
  'Headphones',
];

const SAMPLE_TEST_PHOTOS = [
  {
    label: 'Silver Workstation Laptop',
    url: '/src/assets/images/product_laptop_silver_1795266014764.jpg',
    hint: 'silver laptop workstation',
  },
  {
    label: 'ANC Wireless Headphones',
    url: '/src/assets/images/product_headphones_anc_1795266015392.jpg',
    hint: 'matte wireless noise cancelling headphones',
  },
  {
    label: 'Mechanical Keyboard',
    url: '/src/assets/images/product_keyboard_mech_1795266015738.jpg',
    hint: 'compact wireless mechanical keyboard',
  },
];

export function SearchPage() {
  const { state, recordDemandSignal } = useNetwork();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialMode = searchParams.get('mode') === 'visual' ? 'visual' : 'text';

  const [mode, setMode] = useState<'text' | 'visual'>(initialMode);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [category, setCategory] = useState<ProductCategory | 'All'>('All');
  const [locality, setLocality] = useState('Indiranagar');
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc'>('relevance');
  const [interestLoggedForQuery, setInterestLoggedForQuery] = useState<string | null>(null);

  // Visual Search state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [visualPreviewUrl, setVisualPreviewUrl] = useState<string | null>(null);
  const [visualHint, setVisualHint] = useState('');
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualError, setVisualError] = useState<string | null>(null);
  const [visualApiRes, setVisualApiRes] = useState<VisualSearchApiResponse | null>(null);
  const [visualMatches, setVisualMatches] = useState<VisualSearchMatch[]>([]);
  const [visualUnmatched, setVisualUnmatched] = useState(false);

  const preferredStoreId = session?.preferredStoreId || 'indiranagar';

  useEffect(() => {
    const q = searchParams.get('q') || '';
    const m = searchParams.get('mode') === 'visual' ? 'visual' : 'text';
    setInputValue(q);
    setSubmittedQuery(q);
    setMode(m);
  }, [searchParams]);

  const results = useMemo(() => {
    return searchCatalog(state.products, state.inventory, state.stores, {
      query: submittedQuery,
      category,
      city: 'Bengaluru',
      sortBy,
    });
  }, [state.products, state.inventory, state.stores, submittedQuery, category, sortBy]);

  // Automatically log unmatched text searches to Demand Radar
  useEffect(() => {
    const clean = submittedQuery.trim();
    if (mode === 'text' && clean && results.total === 0) {
      recordDemandSignal({
        query: clean,
        inferredCategory: inferCategoryFromQuery(clean),
        locality,
        outcome: 'UNMATCHED_SEARCH',
        signalSource: 'TEXT_SEARCH',
        session,
      });
    }
  }, [mode, submittedQuery, results.total, locality, recordDemandSignal, session]);

  const suggestions = getSearchSuggestions(state.products, inputValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInterestLoggedForQuery(null);
    setSubmittedQuery(inputValue);
    setSearchParams(inputValue.trim() ? { q: inputValue.trim() } : {});
  };

  const handleChipClick = (q: string) => {
    setMode('text');
    setInterestLoggedForQuery(null);
    setInputValue(q);
    setSubmittedQuery(q);
    setSearchParams(q ? { q } : {});
  };

  const runVisualSearchFromBase64 = async (
    base64DataUrl: string,
    mimeType: string,
    hintOverride?: string
  ) => {
    setVisualPreviewUrl(base64DataUrl);
    setVisualError(null);
    setVisualLoading(true);
    setVisualApiRes(null);
    setVisualMatches([]);
    setVisualUnmatched(false);
    setInterestLoggedForQuery(null);

    try {
      const base64Only = base64DataUrl.includes(',')
        ? base64DataUrl.split(',')[1]
        : base64DataUrl;

      const apiRes = await executeVisualSearch({
        imageBase64: base64Only,
        mimeType,
        textHint: (hintOverride ?? visualHint).trim() || undefined,
      });

      const ranked = combineVisualAndOpenSearch(
        state.products,
        state.inventory,
        state.stores,
        apiRes
      );

      setVisualApiRes(apiRes);
      setVisualMatches(ranked.matches);
      setVisualUnmatched(ranked.isUnmatched);

      if (ranked.isUnmatched) {
        const queryLabel =
          apiRes.visualAnalysis.detectedObject ||
          apiRes.visualAnalysis.suggestedQuery ||
          'Visual hardware query';
        recordDemandSignal({
          query: queryLabel,
          inferredCategory: apiRes.visualAnalysis.category || 'Unclassified',
          locality,
          outcome: 'UNMATCHED_SEARCH',
          signalSource: 'VISUAL_SEARCH',
          session,
        });
      }
    } catch (err) {
      setVisualError(err instanceof Error ? err.message : 'Unable to complete visual search.');
    } finally {
      setVisualLoading(false);
    }
  };

  const prepareVisualImage = async (
    blob: Blob,
    rawType?: string
  ): Promise<{ dataUrl: string; mimeType: string }> => {
    const detectedType = (rawType || blob.type || '').toLowerCase();
    const isDirectAllowed =
      ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(detectedType) &&
      blob.size <= 1_400_000;

    if (isDirectAllowed) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Failed to read image file.'));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(blob);
      });
      return {
        dataUrl,
        mimeType: detectedType === 'image/jpg' ? 'image/jpeg' : detectedType,
      };
    }

    // Downscale large camera photos or convert browser-decodable formats to compact JPEG
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () =>
          reject(new Error('Unsupported or unreadable image file. Please upload a JPG, PNG, or WebP photo.'));
        el.src = objectUrl;
      });

      const maxEdge = 1280;
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const targetWidth = Math.max(1, Math.round((img.naturalWidth || 640) * scale));
      const targetHeight = Math.max(1, Math.round((img.naturalHeight || 480) * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Browser canvas is unavailable to process this image.');
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      return { dataUrl, mimeType: 'image/jpeg' };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const processUploadedFile = async (file: File) => {
    setVisualError(null);
    try {
      const prepared = await prepareVisualImage(file, file.type);
      await runVisualSearchFromBase64(prepared.dataUrl, prepared.mimeType);
    } catch (err) {
      setVisualError(
        err instanceof Error ? err.message : 'Unable to process uploaded photo. Try a JPG, PNG, or WebP image.'
      );
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void processUploadedFile(file);
  };

  const handleSamplePhoto = async (sample: (typeof SAMPLE_TEST_PHOTOS)[number]) => {
    setVisualHint(sample.hint);
    setVisualError(null);
    try {
      const response = await fetch(sample.url);
      if (!response.ok) {
        throw new Error('Unable to load sample product photo.');
      }
      const blob = await response.blob();
      const prepared = await prepareVisualImage(blob, blob.type || 'image/jpeg');
      await runVisualSearchFromBase64(prepared.dataUrl, prepared.mimeType, sample.hint);
    } catch (err) {
      setVisualError(err instanceof Error ? err.message : 'Unable to load sample product photo.');
    }
  };

  const handleRegisterUnmatchedInterest = (queryLabel: string, source: 'TEXT_SEARCH' | 'VISUAL_SEARCH', cat?: string) => {
    const clean = queryLabel.trim();
    if (!clean) return;
    recordDemandSignal({
      query: clean,
      inferredCategory: cat || inferCategoryFromQuery(clean),
      locality,
      outcome: 'REGISTERED_INTEREST',
      signalSource: source,
      session,
    });
    setInterestLoggedForQuery(clean);
  };

  const clearVisualSearch = () => {
    setVisualPreviewUrl(null);
    setVisualApiRes(null);
    setVisualMatches([]);
    setVisualError(null);
    setVisualUnmatched(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A2022]">Intelligent Discovery</h1>
            <p className="text-sm text-[#526063] mt-1">
              OpenSearch natural-language discovery paired with Gemini multimodal visual embeddings for photo-to-product matching.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-[#F0F2F1] border border-[#E1E5E4] rounded-lg self-start">
            <button
              type="button"
              onClick={() => {
                setMode('text');
                setSearchParams(submittedQuery ? { q: submittedQuery } : {});
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'text' ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
              }`}
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              Text &amp; Intent
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('visual');
                setSearchParams({ mode: 'visual' });
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'visual' ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              Photo-to-Product
            </button>
          </div>
        </div>

        {mode === 'text' ? (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-[#526063] absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Search by product, typo ('macbok'), or intent ('4k usb-c monitor for mac')"
                  aria-label="Search query"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#F7F7F5] border border-[#D4DAD8] rounded-lg focus:bg-white focus:outline-none focus:border-[#264C4F]"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg whitespace-nowrap"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[#526063]">Suggested searches:</span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleChipClick(s)}
                    className="px-2.5 py-1 bg-[#F0F2F1] hover:bg-[#E7F0EE] text-[#1A2022] rounded-md transition-colors"
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleChipClick('oled ultrawide 49 inch monitor')}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-md transition-colors"
                >
                  Test Unmatched Query
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="search-locality" className="text-[#526063]">
                  Locality
                </label>
                <select
                  id="search-locality"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="px-2.5 py-1.5 border border-[#D4DAD8] rounded-md bg-white"
                >
                  {state.stores.map((s) => (
                    <option key={s.id} value={s.locality}>
                      {s.locality}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) {
                    void processUploadedFile(droppedFile);
                  }
                }}
                className="lg:col-span-7 border-2 border-dashed border-[#C9DBD7] bg-[#F8FAF9] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#1A2022]">Upload Hardware Photo</p>
                    <p className="text-xs text-[#526063]">
                      Generates a multimodal vector via <code className="font-mono-tabular">gemini-embedding-2</code> and ranks catalog matches using cosine similarity + OpenSearch attribute relevance. Large photos are automatically resized before upload.
                    </p>
                  </div>
                  {visualPreviewUrl && (
                    <button
                      type="button"
                      onClick={clearVisualSearch}
                      aria-label="Clear uploaded photo"
                      className="p-1.5 text-[#526063] hover:text-[#1A2022] rounded-md bg-white border border-[#E1E5E4]"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="visual-search-file"
                  />
                  <label
                    htmlFor="visual-search-file"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    Choose Photo (JPG / PNG / WebP)
                  </label>
                  <input
                    type="text"
                    value={visualHint}
                    onChange={(e) => setVisualHint(e.target.value)}
                    placeholder="Optional intent hint (e.g., 'silent mac wireless')"
                    aria-label="Optional visual search text hint"
                    className="flex-1 px-3.5 py-2 text-xs bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[#526063]">Quick test photos:</span>
                  {SAMPLE_TEST_PHOTOS.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => handleSamplePhoto(sample)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-[#D4DAD8] hover:border-[#264C4F] text-[#1A2022] rounded-md transition-colors"
                    >
                      <ImageIcon className="w-3 h-3 text-[#264C4F]" aria-hidden="true" />
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 bg-[#F7F7F5] border border-[#E1E5E4] rounded-xl p-4 flex flex-col justify-center">
                {visualPreviewUrl ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={visualPreviewUrl}
                      alt="Uploaded visual search query"
                      className="w-24 h-24 object-cover rounded-lg border border-[#D4DAD8] shrink-0 bg-white"
                    />
                    <div className="space-y-1.5 min-w-0">
                      {visualLoading ? (
                        <div className="flex items-center gap-2 text-xs font-medium text-[#264C4F]">
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          Computing visual embeddings &amp; OpenSearch scores...
                        </div>
                      ) : visualApiRes ? (
                        <>
                          <p className="text-xs font-semibold text-[#264C4F]">
                            Detected: {visualApiRes.visualAnalysis.detectedObject}
                          </p>
                          <p className="text-xs text-[#526063] line-clamp-2">
                            {visualApiRes.visualAnalysis.visualSummary}
                          </p>
                          <p className="text-[11px] font-mono-tabular text-[#526063]">
                            {visualApiRes.embeddingDimensions}D embedding · {visualApiRes.indexedCatalogSize} indexed SKUs · Query: &ldquo;{visualApiRes.visualAnalysis.suggestedQuery}&rdquo;
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-[#526063]">Ready for visual matching.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 space-y-1.5">
                    <Camera className="w-6 h-6 text-[#526063] mx-auto" aria-hidden="true" />
                    <p className="text-xs font-medium text-[#1A2022]">No photo uploaded yet</p>
                    <p className="text-[11px] text-[#526063]">
                      Upload a laptop, monitor, keyboard, mouse, or headphone photo or try a quick test image.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {visualError && (
              <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{visualError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results Area */}
      {mode === 'text' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#E9ECEB] rounded-lg">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    category === cat ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono-tabular text-[#526063]">
                {results.total} {results.total === 1 ? 'result' : 'results'}
              </span>
              <select
                aria-label="Sort search results"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'relevance' | 'price_asc' | 'price_desc')}
                className="px-2.5 py-1.5 text-xs bg-white border border-[#D4DAD8] rounded-md"
              >
                <option value="relevance">Relevance</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {results.total === 0 ? (
            <div className="bg-white border border-[#E1E5E4] rounded-xl p-8 sm:p-10 space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-amber-800">Unmatched Query Captured</p>
                <h2 className="text-lg font-semibold text-[#1A2022]">
                  No catalog models matched &ldquo;{submittedQuery}&rdquo;
                </h2>
                <p className="text-sm text-[#526063] max-w-2xl">
                  SYNAPSE recorded this unmatched search for {locality} on the Administrator Demand Radar (distinct from confirmed purchase orders). You can also register explicit restock interest below.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={interestLoggedForQuery === submittedQuery.trim()}
                  onClick={() =>
                    handleRegisterUnmatchedInterest(submittedQuery, 'TEXT_SEARCH')
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:bg-emerald-700 rounded-lg transition-colors"
                >
                  {interestLoggedForQuery === submittedQuery.trim() ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Demand Interest Registered
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                      Register Interest for &ldquo;{submittedQuery}&rdquo;
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleChipClick('')}
                  className="px-4 py-2 text-xs font-medium text-[#1A2022] border border-[#D4DAD8] rounded-lg hover:bg-[#F7F7F5]"
                >
                  View All Products
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.products.map(({ product }) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  preferredStoreId={preferredStoreId}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {visualUnmatched && visualApiRes && (
            <div className="bg-white border border-[#E1E5E4] rounded-xl p-8 space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-amber-800">Unmatched Visual Search Captured</p>
                <h2 className="text-lg font-semibold text-[#1A2022]">
                  No strong catalog match for &ldquo;{visualApiRes.visualAnalysis.detectedObject}&rdquo;
                </h2>
                <p className="text-sm text-[#526063] max-w-2xl">
                  SYNAPSE logged this photo query to Demand Radar ({locality}) as a separate search-interest signal. You can register explicit restock interest below.
                </p>
              </div>
              <button
                type="button"
                disabled={interestLoggedForQuery === visualApiRes.visualAnalysis.detectedObject}
                onClick={() =>
                  handleRegisterUnmatchedInterest(
                    visualApiRes.visualAnalysis.detectedObject,
                    'VISUAL_SEARCH',
                    visualApiRes.visualAnalysis.category
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:bg-emerald-700 rounded-lg transition-colors"
              >
                {interestLoggedForQuery === visualApiRes.visualAnalysis.detectedObject ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Visual Interest Registered
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                    Register Restock Interest
                  </>
                )}
              </button>
            </div>
          )}

          {visualMatches.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[#1A2022]">
                  Visual Embedding + OpenSearch Matches ({visualMatches.length})
                </h2>
                <span className="text-xs text-[#526063]">
                  60% Gemini Visual Vector Similarity · 40% OpenSearch Query Relevance
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {visualMatches.map((match) => (
                  <div key={match.product.id} className="space-y-2">
                    <ProductCard
                      product={match.product}
                      preferredStoreId={preferredStoreId}
                    />
                    <div className="bg-white border border-[#E1E5E4] rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <StatusBadge
                        label={`Hybrid ${Math.round(match.hybridScore * 100)}%`}
                        tone="teal"
                        withIcon={false}
                      />
                      <span className="font-mono-tabular text-[#526063]">
                        Vec {Math.round(match.visualSimilarity * 100)}% · OS{' '}
                        {Math.round(match.openSearchScore * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
