import React from 'react';
import { BRAND, markSvgBody } from './brand';

/**
 * The one logo component. `variant`: 'mark' (emblem only), 'horizontal' (emblem + wordmark) or
 * 'stacked'. `tone`: 'dark' (ivory on dark UI, default) or 'light' (charcoal on light pages).
 */
export const LucknowLensLogo: React.FC<{ variant?: 'mark' | 'horizontal' | 'stacked'; tone?: 'dark' | 'light'; className?: string; title?: string }> = ({ variant = 'mark', tone = 'dark', className, title = BRAND.name }) => {
  const ink = tone === 'dark' ? BRAND.colors.ivory : BRAND.colors.charcoal;
  const cut = tone === 'dark' ? BRAND.colors.charcoal : BRAND.colors.ivory;
  const body = markSvgBody(ink, cut);
  if (variant === 'mark') {
    return <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title} dangerouslySetInnerHTML={{ __html: body }} />;
  }
  if (variant === 'stacked') {
    return (
      <svg viewBox="0 0 200 150" className={className} role="img" aria-label={title}>
        <g transform="translate(50 0)" dangerouslySetInnerHTML={{ __html: body }} />
        <text x="100" y="135" textAnchor="middle" fill={ink} fontFamily="Montserrat, 'Hanken Grotesk', sans-serif" fontSize="17" fontWeight={500} letterSpacing="5">{BRAND.nameUpper}</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 420 100" className={className} role="img" aria-label={title}>
      <g dangerouslySetInnerHTML={{ __html: body }} />
      <text x="112" y="62" fill={ink} fontFamily="Montserrat, 'Hanken Grotesk', sans-serif" fontSize="30" fontWeight={500} letterSpacing="7">{BRAND.nameUpper}</text>
    </svg>
  );
};

/** Back-compatible emblem (used where the old mark was). */
export const LucknowLensMark: React.FC<{ className?: string; title?: string; tone?: 'dark' | 'light' }> = (p) => <LucknowLensLogo variant="mark" {...p} />;
