import { useMemo, useState } from 'react';
import { ProductCard } from '../../components/products/ProductCard';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { searchCatalog } from '../../services/discoveryService';
import type { ProductCategory } from '../../types';

const CATEGORIES: Array<ProductCategory | 'All'> = [
  'All',
  'Laptops',
  'Monitors',
  'Keyboards',
  'Mice',
  'Headphones',
];

export function CataloguePage() {
  const { state } = useNetwork();
  const { session } = useAuth();
  const [category, setCategory] = useState<ProductCategory | 'All'>('All');
  const [brand, setBrand] = useState<string>('All');
  const [maxPriceInr, setMaxPriceInr] = useState<number>(250000);
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc'>('relevance');

  const preferredStoreId = session?.preferredStoreId || 'indiranagar';
  const brands = useMemo(
    () => ['All', ...Array.from(new Set(state.products.map((p) => p.brand)))],
    [state.products]
  );

  const filtered = useMemo(() => {
    const res = searchCatalog(state.products, state.inventory, state.stores, {
      query: '',
      category,
      maxPriceInr,
      city: 'Bengaluru',
      sortBy,
    });
    return res.products
      .map((r) => r.product)
      .filter((p) => (brand === 'All' ? true : p.brand === brand));
  }, [state.products, state.inventory, state.stores, category, maxPriceInr, sortBy, brand]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Product Catalogue</h1>
          <p className="text-sm text-[#526063] mt-1">
            All categories across our 4 Bengaluru demo store nodes.
          </p>
        </div>
        <span className="text-xs font-mono-tabular text-[#526063]">
          Showing {filtered.length} of {state.products.length} products
        </span>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-[#E1E5E4] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F0F2F1] rounded-lg">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                category === cat
                  ? 'bg-white text-[#1A2022] shadow-xs'
                  : 'text-[#526063] hover:text-[#1A2022]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="brand-filter" className="text-xs text-[#526063]">
              Brand
            </label>
            <select
              id="brand-filter"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#D4DAD8] rounded-md"
            >
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="price-filter" className="text-xs text-[#526063]">
              Max Price
            </label>
            <select
              id="price-filter"
              value={maxPriceInr}
              onChange={(e) => setMaxPriceInr(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#D4DAD8] rounded-md font-mono-tabular"
            >
              <option value={250000}>All Prices</option>
              <option value={20000}>Under ₹20,000</option>
              <option value={60000}>Under ₹60,000</option>
              <option value={150000}>Under ₹1,50,000</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="sort-filter" className="text-xs text-[#526063]">
              Sort
            </label>
            <select
              id="sort-filter"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'relevance' | 'price_asc' | 'price_desc')}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#D4DAD8] rounded-md"
            >
              <option value="relevance">Featured</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-10 text-center space-y-3">
          <h2 className="text-base font-semibold text-[#1A2022]">No matching products</h2>
          <p className="text-sm text-[#526063]">
            Adjust your category, brand, or maximum price filter to inspect other models.
          </p>
          <button
            type="button"
            onClick={() => {
              setCategory('All');
              setBrand('All');
              setMaxPriceInr(250000);
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-[#264C4F] rounded-lg"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              preferredStoreId={preferredStoreId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
