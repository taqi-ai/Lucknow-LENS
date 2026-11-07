import React from 'react';

/** TERRALYT topographic T mark (transparent PNG, /public/brand). */
export const TerralytMark: React.FC<{ className?: string; title?: string }> = ({ className, title = 'TERRALYT' }) => (
  <img src="/brand/terralyt-t-64.png" srcSet="/brand/terralyt-t-64.png 1x, /brand/terralyt-t-192.png 3x" alt={title} className={className} draggable={false} />
);
