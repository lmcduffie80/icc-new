'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getImageProxyUrl } from '@/lib/image-proxy';

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  sizes?: string;
  className?: string;
  proxyWidth?: number;
}

export function ProductImage({ src, alt, sizes, className, proxyWidth = 1200 }: ProductImageProps) {
  const [imgSrc, setImgSrc] = useState<string>(
    getImageProxyUrl(src, proxyWidth) || src || '/placeholder.png'
  );

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      sizes={sizes}
      placeholder="empty"
      className={className}
      unoptimized
      onError={() => setImgSrc('/placeholder.png')}
    />
  );
}
