/* Tile art resolution — one deterministic chain for every tile, no
   per-brand cases. Priority:
     1. remote CDN icon (GET /apps `icon`) — the server keeps art current
     2. committed brand SVG (public/brands/<slug>.svg)
     3. generated monogram — deterministic hue from the id, initials from
        the name; identical algorithm for every app, present or not
   `ui` tiles are a separate channel (lucide icon names), resolved in
   AppTile; anything else flows through here. */

export interface TileArt {
  kind: 'remote' | 'svg' | 'monogram';
  src?: string;      // remote or local URL for kinds remote/svg
  initials: string;  // monogram text; also the SVG-failure fallback
  hue: number;       // 0..360, deterministic per tile id
}

/** Hash the id into a stable hue — same app, same colour, every boot.
    FNV-1a: tiny, dependency-free, good spread for short strings. */
function hueFrom(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360);
}

/** 1–2 letter monogram: initials of the first two words, else first two
    chars. Lowercase word-initials read like brand marks at 40px. */
function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function tileArt(tile: { id: string; name: string; brand?: string; iconUrl?: string }): TileArt {
  const initials = initialsFrom(tile.name);
  const hue = hueFrom(tile.id);
  if (tile.iconUrl) return { kind: 'remote', src: tile.iconUrl, initials, hue };
  if (tile.brand && tile.brand !== 'ui') {
    return { kind: 'svg', src: `/brands/${tile.brand}.svg`, initials, hue };
  }
  return { kind: 'monogram', initials, hue };
}
