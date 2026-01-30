import axios from 'axios';
import { FeedItem } from '../types/feed';
import { API_URL } from './apiConfig';

const TIMEOUT = 10000;

const mapBackendItem = (item: Record<string, unknown>): FeedItem => ({
  id: (item.id as string | number)?.toString() ?? (item.externalId as string) ?? '',
  title: typeof item.title === 'string' ? item.title : 'Health News',
  excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
  dateISO: item.dateISO ? new Date(item.dateISO as string).toISOString() : new Date().toISOString(),
  author: typeof item.author === 'string' ? item.author : 'Naga City Health',
  categories: ['Health', 'News'],
  url: typeof item.url === 'string' ? item.url : '',
  imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
  icon: 'newspaper-variant-outline',
});

export interface FetchHealthFeedParams {
  page: number;
  pageSize: number;
}

export const healthFeedService = {
  fetchHealthFeed: async (params?: FetchHealthFeedParams): Promise<FeedItem[]> => {
    const response = await axios.get(`${API_URL}/feed/health`, {
      params,
      timeout: TIMEOUT,
    });

    const payload = response.data;
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.map(mapBackendItem);
  },
};
