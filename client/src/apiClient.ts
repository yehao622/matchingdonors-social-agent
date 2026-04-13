const BASE_URL = import.meta.env.PROD
  ? '/api'
  : 'http://localhost:3001/api';

// ==========================================
// DRY Fetch Wrapper
// ==========================================
async function fetchWrapper(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    // Fail-fast error extraction: Try to get the actual backend error message
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error || errorData?.message || `HTTP Error: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

export const api = {
  scrape: () => fetchWrapper('/scrape'),

  draft: (payload: {
    action: 'INITIAL' | 'CONDENSE';
    title?: string;
    excerpt?: string;
    url?: string;
    originalPost?: string;
    instruction?: string
  }) => fetchWrapper('/draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  publish: (posts: string[], sourceName?: string, url?: string) => fetchWrapper('/publish', {
    method: 'POST',
    body: JSON.stringify({ posts, sourceName, url }),
  }),

  getStatus: () => fetchWrapper('/cron/status'),

  startEngine: () => fetchWrapper('/cron/start', { method: 'POST' }),

  stopEngine: () => fetchWrapper('/cron/stop', { method: 'POST' }),

  getHistory: () => fetchWrapper('/history'),

  getStudioDraft: (crawlerId: string) => fetchWrapper(`/studio/${crawlerId}`),

  // This perfectly handles the 4 parameters we fixed earlier
  publishPost: (posts: string[], sourceName: string, url: string, title: string) => fetchWrapper('/publish', {
    method: 'POST',
    body: JSON.stringify({ posts, sourceName, url, title }),
  })
};