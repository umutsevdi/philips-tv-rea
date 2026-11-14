/* Demo content for desktop/offline. Structured exactly like the Titan
   backend rows (docs/04) so swapping in real data later is a type change,
   not a layout change. Images: picsum placeholders seeded per item. */

import type { PageList, ContentItem, Tile } from './titan';

function item(id: string, title: string, synopsis: string, kind: string, appCode: string, appUrl: string): ContentItem {
  return {
    id,
    type: kind,
    title,
    synopsis,
    images: {}, // gradient placeholders until backend art arrives
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
  item('hero-1', 'Dune: Part Two', 'Paul Atreides unites with the Fremen to wage war against House Harkonnen.', 'movie', 'netflix', 'https://www.netflix.com'),
  item('hero-2', 'The Bear', 'A young chef returns to Chicago to run his family sandwich shop.', 'tv_show', 'disney', 'https://www.disneyplus.com'),
  item('hero-3', 'Formula 1: Drive to Survive', 'Behind the scenes of the world’s fastest motorsport.', 'tv_show', 'prime_video', 'https://www.primevideo.com'),
];

export const DEMO_ROWS: PageList[] = [
  {
    id: 'demo-trending', type: 'top_movies_list', title: 'Trending now',
    items: [
      item('tr-1', 'Oppenheimer', 'The story of the man who built the bomb.', 'movie', 'netflix', 'https://www.netflix.com'),
      item('tr-2', 'Poor Things', 'A young woman is brought back to life by an unorthodox scientist.', 'movie', 'disney', 'https://www.disneyplus.com'),
      item('tr-3', 'The Zone of Interest', 'A Nazi officer and his wife build a life by Auschwitz.', 'movie', 'netflix', 'https://www.netflix.com'),
      item('tr-4', 'Past Lives', 'Two childhood friends reunite in New York two decades apart.', 'movie', 'prime_video', 'https://www.primevideo.com'),
      item('tr-5', 'Killers of the Flower Moon', 'FBI investigates the Osage Nation murders.', 'movie', 'apple', 'https://tv.apple.com'),
      item('tr-6', 'Anatomy of a Fall', 'A woman is suspected of her husband’s death.', 'movie', 'netflix', 'https://www.netflix.com'),
    ],
  },
  {
    id: 'demo-netflix', type: 'netflix_list', title: 'Because you watch thrillers',
    items: [
      item('nf-1', 'The Night Agent', 'An FBI agent uncovers a conspiracy at the White House.', 'tv_show', 'netflix', 'https://www.netflix.com'),
      item('nf-2', 'Reptile', 'A detective unravels a murder with no clear motive.', 'movie', 'netflix', 'https://www.netflix.com'),
      item('nf-3', 'Sex Education', 'A socially awkward teenager starts a sex clinic at school.', 'tv_show', 'netflix', 'https://www.netflix.com'),
      item('nf-4', 'Bodyguard', 'A war veteran protects a controversial politician.', 'tv_show', 'netflix', 'https://www.netflix.com'),
      item('nf-5', 'You', 'A bookseller becomes obsessed with a customer.', 'tv_show', 'netflix', 'https://www.netflix.com'),
      item('nf-6', 'Ozark', 'A financial adviser relocates his family to the Ozarks.', 'tv_show', 'netflix', 'https://www.netflix.com'),
    ],
  },
  {
    id: 'demo-youtube', type: 'youtube_list', title: 'On YouTube',
    items: [
      item('yt-1', 'TED Talks Daily', 'Ideas worth spreading, every weekday.', 'channel_program', 'youtube', 'https://www.youtube.com/tv'),
      item('yt-2', 'Mark Rober', 'Engineering, science, glitter bombs.', 'channel_program', 'youtube', 'https://www.youtube.com/tv'),
      item('yt-3', 'F1 Official', 'Race highlights and onboard cameras.', 'channel_program', 'youtube', 'https://www.youtube.com/tv'),
      item('yt-4', 'Veritasium', 'An element of truth in science videos.', 'channel_program', 'youtube', 'https://www.youtube.com/tv'),
      item('yt-5', 'Cooking with Babish', 'Recreating food from film and TV.', 'channel_program', 'youtube', 'https://www.youtube.com/tv'),
      item('yt-6', 'Slow Mo Guys', 'The world in extreme slow motion.', 'channel_program', 'youtube', 'https://www.youtube.com/tv'),
    ],
  },
];
