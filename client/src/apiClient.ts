const BASE_URL = 'http://localhost:3001/api'; // Single source of truth!

export const api = {
  async scrape() {
    const res = await fetch(`${BASE_URL}/scrape`);
    if (!res.ok) throw new Error('Failed to scrape article');
    return res.json();
  },

  async draft(payload: { action: 'INITIAL' | 'CONDENSE'; title?: string; excerpt?: string; url?: string; originalPost?: string; instruction?: string }) {
    const res = await fetch(`${BASE_URL}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to generate draft');
    return res.json();
  },

  async publish(posts: string[], sourceName?: string, url?: string) {
    const res = await fetch(`${BASE_URL}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts, sourceName, url }),
    });
    if (!res.ok) throw new Error('Failed to publish');
    return res.json();
  },

  async getStatus() {
    const res = await fetch(`${BASE_URL}/cron/status`);
    if (!res.ok) throw new Error('Failed to fetch engine status');
    return res.json();
  },

  async startEngine() {
    const res = await fetch(`${BASE_URL}/cron/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start engine');
    return res.json();
  },

  async stopEngine() {
    const res = await fetch(`${BASE_URL}/cron/stop`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to stop engine');
    return res.json();
  },

  async getHistory() {
    const res = await fetch(`${BASE_URL}/history`);
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  },

  async getStudioDraft(crawlerId: string) {
    const res = await fetch(`${BASE_URL}/studio/${crawlerId}`);
    if (!res.ok) throw new Error('Failed to load Draft Studio');
    return res.json();
  },

  async publishPost(posts: string[], sourceName: string, url: string) {
    const res = await fetch(`${BASE_URL}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts, sourceName, url })
    });
    if (!res.ok) throw new Error('Failed to publish');
    return res.json();
  }
};