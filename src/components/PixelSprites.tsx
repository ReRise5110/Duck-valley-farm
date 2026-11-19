import React from 'react';
import { FarmData, PixelStickerType } from '../types/farm';

export const PixelFarmerSprite: React.FC<{
  avatar: FarmData['farmerAvatar'];
  size?: number;
  className?: string;
}> = ({ avatar, size = 48, className = '' }) => {
  const hatColor =
    avatar === 'sunhat'
      ? '#eab308'
      : avatar === 'ribbon'
        ? '#e11d48'
        : avatar === 'straw'
          ? '#facc15'
          : '#0284c7';
  const hatShade =
    avatar === 'sunhat'
      ? '#b45309'
      : avatar === 'ribbon'
        ? '#9f1239'
        : avatar === 'straw'
          ? '#ca8a04'
          : '#0369a1';
  const shirtColor =
    avatar === 'ribbon'
      ? '#38bdf8'
      : avatar === 'sunhat'
        ? '#22c55e'
        : avatar === 'straw'
          ? '#f59e0b'
          : '#ef4444';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Ground shadow */}
      <rect x="4" y="15" width="8" height="1" fill="#2d5a1c" opacity="0.4" />
      {/* Hat / Hair (16-bit tone-on-tone shading) */}
      {avatar === 'ribbon' ? (
        <>
          <rect x="5" y="1" width="6" height="1" fill="#5c1a1b" />
          <rect x="4" y="2" width="8" height="2" fill="#88292b" />
          <rect x="6" y="1" width="4" height="1" fill={hatColor} />
          <rect x="7" y="2" width="2" height="1" fill={hatShade} />
          <rect x="3" y="4" width="2" height="4" fill="#6e1f21" />
          <rect x="11" y="4" width="2" height="4" fill="#6e1f21" />
        </>
      ) : (
        <>
          <rect x="4" y="1" width="8" height="2" fill={hatColor} />
          <rect x="2" y="3" width="12" height="1" fill={hatShade} />
          <rect x="4" y="2" width="8" height="1" fill={hatShade} opacity="0.65" />
        </>
      )}
      {/* Face */}
      <rect x="5" y="4" width="6" height="4" fill="#fed7aa" />
      <rect x="5" y="7" width="6" height="1" fill="#fdba74" />
      <rect x="6" y="5" width="1" height="1" fill="#334155" />
      <rect x="9" y="5" width="1" height="1" fill="#334155" />
      <rect x="5" y="6" width="1" height="1" fill="#fb7185" opacity="0.7" />
      <rect x="10" y="6" width="1" height="1" fill="#fb7185" opacity="0.7" />
      {/* Shirt + Overalls */}
      <rect x="4" y="8" width="8" height="4" fill={shirtColor} />
      <rect x="5" y="9" width="6" height="4" fill="#2563eb" />
      <rect x="5" y="12" width="6" height="1" fill="#1d4ed8" />
      <rect x="6" y="9" width="4" height="1" fill={shirtColor} />
      {/* Arms */}
      <rect x="3" y="8" width="1" height="3" fill="#fdba74" />
      <rect x="12" y="8" width="1" height="3" fill="#fdba74" />
      {/* Boots */}
      <rect x="5" y="13" width="2" height="2" fill="#78350f" />
      <rect x="9" y="13" width="2" height="2" fill="#78350f" />
    </svg>
  );
};

export const PixelWorkerSprite: React.FC<{
  size?: number;
  className?: string;
}> = ({ size = 44, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Ground shadow */}
      <rect x="4" y="15" width="8" height="1" fill="#2d5a1c" opacity="0.4" />
      {/* Green farm cap */}
      <rect x="5" y="1" width="6" height="2" fill="#15803d" />
      <rect x="5" y="2" width="6" height="1" fill="#166534" />
      <rect x="5" y="3" width="8" height="1" fill="#22c55e" />
      {/* Face */}
      <rect x="5" y="4" width="6" height="4" fill="#fed7aa" />
      <rect x="5" y="7" width="6" height="1" fill="#fdba74" />
      <rect x="4" y="4" width="1" height="2" fill="#572c18" />
      <rect x="7" y="5" width="1" height="1" fill="#334155" />
      <rect x="10" y="5" width="1" height="1" fill="#334155" />
      {/* Teal shirt & warm tan work apron */}
      <rect x="4" y="8" width="8" height="4" fill="#0d9488" />
      <rect x="5" y="9" width="6" height="4" fill="#d97706" />
      <rect x="6" y="10" width="4" height="2" fill="#f59e0b" />
      {/* Arms & small feed scoop */}
      <rect x="3" y="8" width="1" height="3" fill="#fdba74" />
      <rect x="12" y="8" width="1" height="3" fill="#fdba74" />
      <rect x="12" y="10" width="2" height="2" fill="#94a3b8" />
      {/* Boots */}
      <rect x="5" y="13" width="2" height="2" fill="#451a03" />
      <rect x="9" y="13" width="2" height="2" fill="#451a03" />
    </svg>
  );
};

export const PixelBlackCatSprite: React.FC<{
  size?: number;
  className?: string;
}> = ({ size = 38, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {/* Ground shadow */}
      <rect x="3" y="15" width="10" height="1" fill="#2d5a1c" opacity="0.4" />
      {/* Tail (curved upright black tail on left, facing right by default) */}
      <rect x="1" y="6" width="2" height="2" fill="#18181b" />
      <rect x="2" y="8" width="2" height="3" fill="#27272a" />
      <rect x="3" y="10" width="2" height="2" fill="#18181b" />
      {/* Cat Body */}
      <rect x="4" y="9" width="7" height="4" fill="#18181b" />
      <rect x="5" y="9" width="5" height="2" fill="#27272a" />
      <rect x="4" y="12" width="7" height="1" fill="#09090b" />
      {/* Cute Paws */}
      <rect x="4" y="13" width="2" height="2" fill="#09090b" />
      <rect x="9" y="13" width="2" height="2" fill="#09090b" />
      <rect x="5" y="14" width="1" height="1" fill="#3f3f46" />
      <rect x="10" y="14" width="1" height="1" fill="#3f3f46" />
      {/* Cat Ears */}
      <rect x="8" y="2" width="2" height="2" fill="#18181b" />
      <rect x="12" y="2" width="2" height="2" fill="#18181b" />
      <rect x="9" y="3" width="1" height="1" fill="#fda4af" />
      <rect x="12" y="3" width="1" height="1" fill="#fda4af" />
      {/* Cat Head */}
      <rect x="8" y="4" width="6" height="4" fill="#18181b" />
      <rect x="9" y="4" width="4" height="1" fill="#27272a" />
      <rect x="7" y="5" width="1" height="3" fill="#09090b" />
      {/* Bright Cat Eyes & Tiny Nose */}
      <rect x="10" y="5" width="1" height="2" fill="#facc15" />
      <rect x="13" y="5" width="1" height="2" fill="#facc15" />
      <rect x="12" y="7" width="1" height="1" fill="#fb7185" />
      {/* Red Collar + Golden Bell */}
      <rect x="8" y="8" width="5" height="1" fill="#dc2626" />
      <rect x="9" y="8" width="4" height="1" fill="#ef4444" />
      <rect x="12" y="9" width="1" height="1" fill="#fde047" />
    </svg>
  );
};

export const PixelDuckSprite: React.FC<{
  variant?: 'white' | 'duckling';
  flip?: boolean;
  size?: number;
  className?: string;
}> = ({ variant = 'white', flip = false, size = 32, className = '' }) => {
  const body = variant === 'duckling' ? '#fde047' : '#ffffff';
  const mid = variant === 'duckling' ? '#facc15' : '#f1f5f9';
  const shade = variant === 'duckling' ? '#ca8a04' : '#cbd5e1';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      {/* 16-bit Tone-on-Tone Shading (no harsh black outlines) */}
      <rect x="7" y="2" width="4" height="1" fill={mid} />
      <rect x="6" y="3" width="1" height="4" fill={shade} />
      <rect x="7" y="3" width="4" height="4" fill={body} />
      <rect x="3" y="7" width="8" height="1" fill={mid} />
      <rect x="2" y="8" width="9" height="3" fill={body} />
      <rect x="3" y="11" width="8" height="1" fill={shade} />
      {/* Wing highlight & shadow */}
      <rect x="4" y="8" width="5" height="2" fill={mid} />
      <rect x="4" y="10" width="5" height="1" fill={shade} />
      {/* Eye */}
      <rect x="9" y="4" width="1" height="1" fill="#334155" />
      {/* Beak */}
      <rect x="11" y="5" width="3" height="2" fill="#f97316" />
      <rect x="12" y="5" width="2" height="1" fill="#fb923c" />
      <rect x="11" y="6" width="3" height="1" fill="#ea580c" />
      {/* Feet */}
      <rect x="5" y="12" width="1" height="2" fill="#ea580c" />
      <rect x="5" y="13" width="2" height="1" fill="#ea580c" />
      <rect x="8" y="12" width="1" height="2" fill="#ea580c" />
      <rect x="8" y="13" width="2" height="1" fill="#ea580c" />
    </svg>
  );
};

export const PixelSticker: React.FC<{
  type: PixelStickerType;
  size?: number;
}> = ({ type, size = 18 }) => {
  switch (type) {
    case 'duckling':
      return <PixelDuckSprite variant="duckling" size={size} />;
    case 'syringe':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
          <rect x="11" y="1" width="3" height="1" fill="#64748b" />
          <rect x="12" y="2" width="1" height="2" fill="#94a3b8" />
          <rect x="9" y="3" width="4" height="2" fill="#38bdf8" />
          <rect x="6" y="5" width="5" height="4" fill="#e0f2fe" />
          <rect x="7" y="6" width="3" height="2" fill="#06b6d4" />
          <rect x="4" y="8" width="3" height="3" fill="#cbd5e1" />
          <rect x="2" y="11" width="2" height="2" fill="#64748b" />
          <rect x="1" y="13" width="1" height="2" fill="#ef4444" />
        </svg>
      );
    case 'heart':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
          <rect x="3" y="3" width="3" height="2" fill="#e11d48" />
          <rect x="10" y="3" width="3" height="2" fill="#e11d48" />
          <rect x="2" y="4" width="5" height="4" fill="#f43f5e" />
          <rect x="9" y="4" width="5" height="4" fill="#f43f5e" />
          <rect x="5" y="5" width="6" height="4" fill="#f43f5e" />
          <rect x="4" y="9" width="8" height="2" fill="#e11d48" />
          <rect x="6" y="11" width="4" height="2" fill="#be123c" />
          <rect x="7" y="13" width="2" height="1" fill="#be123c" />
          <rect x="3" y="5" width="1" height="2" fill="#fda4af" />
        </svg>
      );
    case 'crate':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
          <rect x="2" y="4" width="12" height="10" fill="#b45309" />
          <rect x="3" y="5" width="10" height="8" fill="#f59e0b" />
          <rect x="3" y="8" width="10" height="2" fill="#d97706" />
          <rect x="6" y="3" width="4" height="2" fill="#f43f5e" />
          <rect x="7" y="5" width="2" height="8" fill="#fb7185" />
        </svg>
      );
    case 'broom':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
          <rect x="10" y="1" width="2" height="6" fill="#b45309" />
          <rect x="8" y="6" width="2" height="2" fill="#92400e" />
          <rect x="5" y="8" width="6" height="2" fill="#eab308" />
          <rect x="3" y="10" width="8" height="4" fill="#fde047" />
          <rect x="4" y="12" width="1" height="2" fill="#ca8a04" />
          <rect x="7" y="12" width="1" height="2" fill="#ca8a04" />
          <rect x="9" y="12" width="1" height="2" fill="#ca8a04" />
        </svg>
      );
    case 'star':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
          <rect x="7" y="1" width="2" height="3" fill="#f59e0b" />
          <rect x="2" y="5" width="12" height="2" fill="#fbbf24" />
          <rect x="4" y="7" width="8" height="3" fill="#f59e0b" />
          <rect x="3" y="10" width="3" height="3" fill="#d97706" />
          <rect x="10" y="10" width="3" height="3" fill="#d97706" />
          <rect x="6" y="4" width="4" height="4" fill="#fde047" />
        </svg>
      );
  }
};
