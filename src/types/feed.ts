export interface FeedItem {
  id: string;
  title: string;
  excerpt: string;
  dateISO: string;
  author: string;
  categories: string[];
  url: string;
  imageUrl?: string;
  /**
   * For UI compatibility with existing FeedItem component
   */
  icon?: string;
}

export interface FeedState {
  items: FeedItem[];
  lastUpdated?: number;
}
