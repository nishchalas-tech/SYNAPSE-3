import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, MapPin, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { ProductCard } from '../../components/products/ProductCard';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { HERO_SHOWROOM_IMAGE } from '../../data/seedData';
import { getSearchSuggestions } from '../../services/discoveryService';

export function HomePage() {
  const { state } = useNetwork();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const preferredStoreId = session?.preferredStoreId || 'indiranagar';
  const featuredProducts = state.products.slice(0, 6);
  const suggestions = getSearchSuggestions(state.products, searchQuery);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <div className="space-y-16 pb-12">
      {/* Split Architectural Hero */}
      <section className="bg-white border-b border-[#E1E5E4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#264C4F]">
                  Bengaluru Connected Retail Network · 4 Demo Stores
                </p>
                <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-semibold text-[#1A2022] tracking-tight leading-[1.15] [text-wrap:balance]">
                  Precision electronics, fulfilled from verified store shelves near you.
                </h1>
                <p className="text-base text-[#526063] max-w-xl leading-relaxed">
                  Search by text or photo, balance cost against dispatch speed with the Trade-off Slider, and recover out-of-stock models across our Indiranagar, Jayanagar, Whitefield, and Koramangala nodes.
                </p>
              </div>

              {/* Intelligent Discovery Search Bar */}
              <div className="space-y-3">
                <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <Search
                      className="w-4 h-4 text-[#526063] absolute left-3.5 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Try 'macbok pro', '4k monitor for mac', or 'silent ergonomic mouse'"
                      aria-label="Search electronics catalog"
                      className="w-full pl-10 pr-4 py-3 text-sm bg-[#F7F7F5] border border-[#D4DAD8] rounded-lg focus:bg-white focus:outline-none focus:border-[#264C4F]"
                    />
                  </div>
                  <Link
                    to="/search?mode=visual"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-3 text-sm font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D4E4E1] rounded-lg whitespace-nowrap shrink-0 transition-colors"
                    title="Photo-to-product visual embedding search"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    <span>Photo Search</span>
                  </Link>
                  <button
                    type="submit"
                    className="px-5 py-3 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg whitespace-nowrap shrink-0 transition-colors"
                  >
                    Search Network
                  </button>
                </form>

                <div className="flex flex-wrap items-center gap-2 text-xs text-[#526063]">
                  <span>Try:</span>
                  {suggestions.slice(0, 4).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => navigate(`/search?q=${encodeURIComponent(suggestion)}`)}
                      className="px-2.5 py-1 bg-[#F0F2F1] hover:bg-[#E7F0EE] text-[#1A2022] rounded-md transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to="/catalogue"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#264C4F] hover:underline"
                >
                  Browse Full Catalogue
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                {!session && (
                  <Link to="/login" className="text-sm font-medium text-[#526063] hover:text-[#1A2022]">
                    Portal Sign In
                  </Link>
                )}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-72 sm:h-96 lg:h-full rounded-xl overflow-hidden border border-[#E1E5E4] bg-[#F0F2F1]">
                <img
                  src={HERO_SHOWROOM_IMAGE}
                  alt="SYNAPSE architectural electronics retail showroom in Bengaluru"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Store Network Strip below Hero */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-8 border-t border-[#EEF1F0]">
            {state.stores.map((store) => (
              <div key={store.id} className="p-4 rounded-lg bg-[#F7F7F5] border border-[#E1E5E4]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#1A2022]">{store.locality}</span>
                  <span className="text-xs font-mono-tabular text-[#264C4F]">
                    {store.fulfilmentHours}h · {store.distanceKm.toFixed(1)} km
                  </span>
                </div>
                <p className="text-xs text-[#526063] mt-1 truncate">{store.address}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Curated Collection */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[#1A2022]">Curated Hardware Collection</h2>
            <p className="text-sm text-[#526063] mt-1">
              Live sellable stock verified at store level across Laptops, Monitors, Keyboards, Mice, and Headphones.
            </p>
          </div>
          <Link
            to="/catalogue"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#264C4F] hover:underline whitespace-nowrap"
          >
            View all {state.products.length} products
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              preferredStoreId={preferredStoreId}
            />
          ))}
        </div>
      </section>

      {/* Core Network Capabilities */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <SlidersHorizontal className="w-5 h-5 text-[#264C4F]" aria-hidden="true" />
            <h3 className="text-base font-semibold text-[#1A2022]">Trade-off Fulfilment Slider</h3>
            <p className="text-sm text-[#526063] leading-relaxed">
              Rank eligible Bengaluru stores by lowest total cost, shortest readiness window, or closest distance—with clear explanations.
            </p>
          </div>
          <div className="space-y-2">
            <ShieldCheck className="w-5 h-5 text-[#264C4F]" aria-hidden="true" />
            <h3 className="text-base font-semibold text-[#1A2022]">Stock Whisperer Verification</h3>
            <p className="text-sm text-[#526063] leading-relaxed">
              Sellable quantities reflect physically verified shelf counts minus active reservations and safety buffers, reducing cancellation risk.
            </p>
          </div>
          <div className="space-y-2">
            <MapPin className="w-5 h-5 text-[#264C4F]" aria-hidden="true" />
            <h3 className="text-base font-semibold text-[#1A2022]">Three-Tier Product Rescue</h3>
            <p className="text-sm text-[#526063] leading-relaxed">
              When your preferred store is out of stock, SYNAPSE locates network stock, suggests compatible models, or captures Demand Radar interest.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
