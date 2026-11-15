/* Demo content — DESKTOP DEV ONLY (isDesktopDev gate in App.svelte).
   Never rendered on the TV: on the TV every pixel comes from real sources
   (TV channels via the proxy, Titan backend when a token exists), and an
   empty row stays honestly empty instead of showing fake shows.
   Structured exactly like the Titan backend rows (docs/04) so swapping in
   real data later is a type change, not a layout change. Images: picsum
   placeholders seeded per item, standing in for backend artwork. */

import type { PageList, ContentItem } from './titan';

function item(id: string, title: string, synopsis: string, appCode: string, appUrl: string, art = 640): ContentItem {
  return {
    id,
    type: 'movie',
    title,
    synopsis,
    images: { artwork_landscape: `https://picsum.photos/seed/${id}/${art}/${Math.round((art * 9) / 16)}` },
    deeplinkings: [{
      app: {
        id: appCode, code: appCode, name: appCode, icon: '', url: appUrl,
        app_type: 'NetTV', resolution: '1080p', isFVPApp: false,
      },
      url: appUrl,
    }],
  };
}

export const DEMO_HERO: ContentItem[] = [
  item('hero-1', 'Dune: Part Two', 'Paul Atreides unites with the Fremen to wage war against House Harkonnen.', 'netflix', 'https://www.netflix.com', 1280),
  item('hero-2', 'The Bear', 'A young chef returns to Chicago to run his family sandwich shop.', 'disney', 'https://www.disneyplus.com', 1280),
  item('hero-3', 'Formula 1: Drive to Survive', 'Behind the scenes of the world’s fastest motorsport.', 'prime_video', 'https://www.primevideo.com', 1280),
];

export const DEMO_ROWS: PageList[] = [
  {
    id: 'demo-on-now', type: 'top_movies_list', title: 'On now',
    items: [
      item('tr-1', 'Oppenheimer', 'The story of the man who built the bomb.', 'netflix', 'https://www.netflix.com'),
      item('nf-1', 'The Night Agent', 'An FBI agent uncovers a conspiracy at the White House.', 'netflix', 'https://www.netflix.com'),
      item('tr-2', 'Poor Things', 'A young woman is brought back to life by an unorthodox scientist.', 'disney', 'https://www.disneyplus.com'),
      item('nf-3', 'Sex Education', 'A socially awkward teenager starts a sex clinic at school.', 'netflix', 'https://www.netflix.com'),
      item('tr-4', 'Past Lives', 'Two childhood friends reunite in New York two decades apart.', 'prime_video', 'https://www.primevideo.com'),
      item('yt-1', 'TED Talks Daily', 'Ideas worth spreading, every weekday.', 'youtube', 'https://www.youtube.com/tv'),
      item('tr-5', 'Killers of the Flower Moon', 'FBI investigates the Osage Nation murders.', 'apple', 'https://tv.apple.com'),
      item('nf-4', 'Bodyguard', 'A war veteran protects a controversial politician.', 'netflix', 'https://www.netflix.com'),
    ],
  },
];

/* Demo channel lineup for desktop dev — mirrors a real channel DB shape. */
export const DEMO_CHANNELS = [
  { id: 1, number: 1, name: 'BBC One', logo: '' },
  { id: 2, number: 2, name: 'BBC Two', logo: '' },
  { id: 3, number: 3, name: 'ITV 1', logo: '' },
  { id: 4, number: 4, name: 'Channel 4', logo: '' },
  { id: 101, number: 101, name: 'CBBC', logo: '' },
  { id: 201, number: 201, name: 'Sky News', logo: '' },
  { id: 301, number: 301, name: 'Eurosport', logo: '' },
];
