// src/server.ts
import express from 'express';
import cors from 'cors';

import { CrawlerManager } from './services/CrawlerManager.js';
import { generateInitialDraft, condensePost } from './services/aiService.js';
import { publishThreadToBluesky } from './services/socialService.js';
import { shortenUrl } from './services/urlService.js';

const app = express();
const PORT = process.env.PORT || 3001; // Backend runs on 3001, React will run on 3000

// Middleware
app.use(cors()); // Allows React frontend to talk to this API
app.use(express.json()); // Allows to read JSON bodies in POST requests

// ==========================================
// ENDPOINT 1: Scrape a random article
// ==========================================
app.get('/api/scrape', async (req, res) => {
    try {
        const manager = new CrawlerManager();
        const articleData = await manager.fetchRandomArticleFromAnySource();

        // Return the scraped data to the frontend
        res.json({
            title: articleData.title,
            excerpt: articleData.excerpt,
            url: articleData.url
        });
    } catch (error) {
        console.error('Scrape error:', error);
        res.status(500).json({ error: 'Failed to scrape article.' });
    }
});

// ==========================================
// ENDPOINT 2: Generate or Condense Drafts
// ==========================================
app.post('/api/draft', async (req, res) => {
    try {
        // We use the same endpoint for initial drafts AND condensing
        const { action, title, excerpt, url, originalPost, instruction } = req.body;

        if (action === 'INITIAL') {
            const finalUrl = await shortenUrl(url);
            const posts = await generateInitialDraft(title, excerpt, finalUrl);
            return res.json({ posts });
        }

        else if (action === 'CONDENSE') {
            const newText = await condensePost(originalPost, instruction);
            return res.json({ text: newText });
        }

        res.status(400).json({ error: 'Invalid action.' });
    } catch (error) {
        console.error('AI Draft error:', error);
        res.status(500).json({ error: 'Failed to generate content.' });
    }
});

// ==========================================
// ENDPOINT 3: Publish to Bluesky
// ==========================================
app.post('/api/publish', async (req, res) => {
    try {
        let { posts } = req.body;

        // Clean the array on the backend side just to be safe
        if (Array.isArray(posts)) {
            posts = posts.filter((p: string) => typeof p === 'string' && p.trim().length > 0);
        }

        if (!posts || !Array.isArray(posts) || posts.length === 0) {
            return res.status(400).json({ error: 'No posts provided.' });
        }

        await publishThreadToBluesky(posts);
        res.json({ success: true, message: 'Successfully published to Bluesky!' });
    } catch (error) {
        console.error('Publish error:', error);
        res.status(500).json({ error: 'Failed to publish to Bluesky.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`🌐 API Server is running on http://localhost:${PORT}`);
    console.log(`Use 'npx tsx src/index.ts' if you want to run the CLI instead!`);
});