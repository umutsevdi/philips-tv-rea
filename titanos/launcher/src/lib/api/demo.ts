/* Demo content for desktop/offline. Structured exactly like the Titan
   backend rows (docs/04) so swapping in real data later is a type change,
   not a layout change. Home shows ONE showcase row — the stock launcher's
   show volume is mostly paid promo lists (docs/04/05), which we don't
   imitate (docs/08 de-bloat). Images: picsum placeholders seeded per item,
   standing in for backend artwork_landscape until Phase 2. */

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

/* The single showcase row: our curated mix of shows + live channels
   (channels are appended in App.svelte), deeplinked into whichever app
   streams each title. Not a partner promo shelf. */
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
