import React, { useId } from 'react';

/**
 * TERRALYT window-seat mark: an aircraft window with the shade half up, Rumi
 * Darwaza's arch and its towers below, the Gomti in gold. The frame takes the
 * current text colour, so it reads on the light pages and on the dark map.
 */
export const TerralytMark: React.FC<{ className?: string; title?: string }> = ({ className, title = 'LUCKNOW LENS' }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="12 4 76 92" className={className} role="img" aria-label={title}>
      <defs>
        <clipPath id={`${id}p`}><rect x="30" y="14" width="40" height="72" rx="20" /></clipPath>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bccad8" /><stop offset=".72" stopColor="#e6ddcf" /></linearGradient>
      </defs>
      <rect x="24" y="8" width="52" height="84" rx="26" fill="#eceae4" stroke="currentColor" strokeWidth="5" />
      <g clipPath={`url(#${id}p)`}>
        <rect x="30" y="14" width="40" height="72" fill={`url(#${id}s)`} />
        <path d="M30 79 C40 73 52 85 70 77 V86 H30 Z" fill="#9c7a2b" opacity=".6" />
        <path d="M37 86 V63 C37 57 41.5 55 44.5 55 C45.5 50 47.5 48 50 45.5 C52.5 48 54.5 50 55.5 55 C58.5 55 63 57 63 63 V86 Z" fill="#8e2c42" />
        <rect x="33.2" y="60" width="2.6" height="26" fill="#8e2c42" /><circle cx="34.5" cy="59" r="2" fill="#8e2c42" />
        <rect x="64.2" y="60" width="2.6" height="26" fill="#8e2c42" /><circle cx="65.5" cy="59" r="2" fill="#8e2c42" />
        <path d="M45 86 V69 C45 65 47.5 63 50 60.5 C52.5 63 55 65 55 69 V86 Z" fill="#efe3d1" />
        <rect x="30" y="14" width="40" height="18" fill="#f6f3ec" />
        <rect x="30" y="30.5" width="40" height="2.2" fill="#cdc4b4" />
      </g>
    </svg>
  );
};
