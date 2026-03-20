'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getImageProxyUrl } from '@/lib/image-proxy';

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  sizes?: string;
  className?: string;
}

export function ProductImage({ src, alt, sizes, className }: ProductImageProps) {
  const [imgSrc, setImgSrc] = useState<string>(
    getImageProxyUrl(src) || src || '/placeholder.png'
  );

  const isUnoptimized =
    imgSrc.includes('/api/images/proxy') ||
    imgSrc.includes('s3.amazonaws.com') ||
    imgSrc.includes('.s3.');

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      sizes={sizes}
      placeholder="empty"
      className={className}
      unoptimized={isUnoptimized}
      onError={() => setImgSrc('/placeholder.png')}
    />
  );
}
