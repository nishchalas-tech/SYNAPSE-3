import { useState } from 'react';
import { Monitor } from 'lucide-react';

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectClass?: string;
}

export function ProductImage({
  src,
  alt,
  className = '',
  aspectClass = 'aspect-[4/3]',
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`${aspectClass} w-full bg-gradient-to-br from-[#F0F2F1] to-[#E2E8E6] flex flex-col items-center justify-center p-4 text-[#526063] ${className}`}
        role="img"
        aria-label={alt}
      >
        <Monitor className="w-8 h-8 mb-2 text-[#264C4F]" aria-hidden="true" />
        <span className="text-xs font-medium text-center line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <div className={`${aspectClass} w-full overflow-hidden bg-[#F0F2F1] ${className}`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
      />
    </div>
  );
}
