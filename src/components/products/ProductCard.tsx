import { Link } from 'react-router-dom';
import { useNetwork } from '../../context/NetworkContext';
import type { Product } from '../../types';
import { formatInr } from '../../utils/formatters';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
  product: Product;
  preferredStoreId?: string;
}

export function ProductCard({ product, preferredStoreId = 'indiranagar' }: ProductCardProps) {
  const { state } = useNetwork();

  const preferredInv = state.inventory.find(
    (r) => r.productId === product.id && r.storeId === preferredStoreId
  );
  const preferredStore = state.stores.find((s) => s.id === preferredStoreId);
  const networkTotalSellable = state.inventory
    .filter((r) => r.productId === product.id)
    .reduce((sum, r) => sum + r.sellableQty, 0);

  const preferredSellable = preferredInv?.sellableQty ?? 0;
  const preferredCartHold = preferredInv?.cartHoldQty ?? 0;

  let availabilityText = '';
  let availabilityToneClass = 'text-[#526063]';

  if (preferredSellable > 0) {
    availabilityText = `${preferredSellable} sellable at ${preferredStore?.locality || 'Nearby'}`;
    availabilityToneClass = 'text-[#264C4F]';
  } else if (preferredCartHold > 0) {
    availabilityText = `Held in 10m cart · ${
      state.inventory.filter((r) => r.productId === product.id && r.sellableQty > 0).length
    } other stores`;
    availabilityToneClass = 'text-amber-800';
  } else if (networkTotalSellable > 0) {
    availabilityText = `Available at ${state.inventory.filter((r) => r.productId === product.id && r.sellableQty > 0).length} other stores`;
    availabilityToneClass = 'text-amber-800';
  } else {
    availabilityText = 'Out of stock across network';
    availabilityToneClass = 'text-red-700';
  }

  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col bg-white border border-[#E1E5E4] rounded-xl overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#264C4F]"
    >
      <ProductImage src={product.imageUrl} alt={product.name} />
      <div className="p-5 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#526063] mb-1">
            <span>{product.brand}</span>
            <span aria-hidden="true">·</span>
            <span>{product.category}</span>
          </div>
          <h3 className="text-base font-semibold text-[#1A2022] leading-snug group-hover:text-[#264C4F] transition-colors">
            {product.name}
          </h3>
          <p className="text-xs text-[#526063] mt-1.5 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="pt-3 border-t border-[#EEF1F0] flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold font-mono-tabular text-[#1A2022]">
            {formatInr(product.priceInr)}
          </span>
          <span className={`text-xs font-medium truncate ${availabilityToneClass}`}>
            {availabilityText}
          </span>
        </div>
      </div>
    </Link>
  );
}
