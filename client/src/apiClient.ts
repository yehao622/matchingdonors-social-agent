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

  async publish(posts: string[]) {
    const res = await fetch(`${BASE_URL}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts }),
    });
    if (!res.ok) throw new Error('Failed to publish');
    return res.json();
  }
};