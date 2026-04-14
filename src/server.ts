import dotenv from 'dotenv';
dotenv.config();

// Fail-Fast Validation
const requiredEnvs = ['GEMINI_API_KEY', 'BLUESKY_HANDLE', 'BLUESKY_PASSWORD'];
const missing = requiredEnvs.filter(env => !process.env[env]);

if (missing.length > 0) {
    console.error(`❌ FATAL ERROR: Missing required environment variables:`);
    missing.forEach(env => console.error(`   - ${env}`));
    process.exit(1); // Crash immediately!
}
console.log('✅ Environment variables validated.');

import express from 'express';
import cors from 'cors';

import { crawlerManager } from './services/CrawlerManager.js';
import { generateInitialDraft, condensePost } from './services/aiService.js';
import { publishThreadToBluesky } from './services/socialService.js';
import { shortenUrl } from './services/urlService.js';
import { historyService } from './services/HistoryService.js';
import { cronService } from './services/CronService.js';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001; // Backend runs on 3001, React will run on 3000

// Middleware
app.use(cors()); // Allows React frontend to talk to this API
app.use(express.json()); // Allows to read JSON bodies in POST requests
app.use(cors({
    origin: ['http://localhost:5173', 'https://matchingdonors.com']
}));
app.use(express.static(path.join(process.cwd(), 'client/dist')));

// ==========================================
// ENDPOINT 1: Scrape a random article
// ==========================================
app.get('/api/scrape', async (req, res) => {
    try {
        const articleData = await crawlerManager.fetchOneArticleFromSources();

        // Return the scraped data to the frontend
        res.json({
            title: articleData.title,
            excerpt: articleData.excerpt,
            url: articleData.url,
            sourceName: articleData.sourceName
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
        let { posts, sourceName, url, title } = req.body;

        // Clean the array on the backend side just to be safe
        if (Array.isArray(posts)) {
            posts = posts.filter((p: string) => typeof p === 'string' && p.trim().length > 0);
        }

        if (!posts || posts.length === 0) {
            return res.status(400).json({ error: 'No valid posts provided.' });
        }

        await publishThreadToBluesky(posts);

        if (url && sourceName) {
            await historyService.markArticleCrawled(title || 'Manual Edit', sourceName, url);
        }

        res.json({ success: true, message: 'Successfully published to Bluesky!' });
    } catch (error) {
        console.error('Publish error:', error);
        res.status(500).json({ error: 'Failed to publish to Bluesky.' });
    }
});

// ==========================================
// ENDPOINT 4: CRON ENGINE CONTROLS
// ==========================================
app.get('/api/cron/status', (req, res) => {
    res.json({
        isRunning: cronService.isRunning,
        status: cronService.currentStatus
    });
});

app.post('/api/cron/start', (req, res) => {
    cronService.start();
    res.json({ success: true, message: 'Cron engine started.' });
});

app.post('/api/cron/stop', (req, res) => {
    cronService.stop();
    res.json({ success: true, message: 'Cron engine stopped.' });
});

// ==========================================
// ENDPOINT 5: HISTORY LOG
// ==========================================
app.get('/api/history', async (req, res) => {
    try {
        const records = await historyService.getRecentHistory();
        res.json(records);
    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch history.' });
    }
});

// ==========================================
// ENDPOINT 6: DRAFT STUDIO (MANUAL OVERRIDE)
// ==========================================
app.get('/api/studio/:crawlerId', async (req, res) => {
    try {
        const { crawlerId } = req.params;

        // If the cron engine was actively counting down, grab its data instantly!
        if (cronService.pendingArticle && cronService.pendingDrafts.length > 0) {
            console.log('⚡ Draft Studio intercepted the Cron Engine cache! Bypassing Gemini.');
            const article = cronService.pendingArticle;
            const posts = cronService.pendingDrafts;

            // Clear the cache so it doesn't get accidentally reused later
            cronService.pendingArticle = null;
            cronService.pendingDrafts = [];

            return res.json({ article, posts });
        }

        // 1. Find the specific crawler by its class name
        const crawler = crawlerManager.getCrawlerById(crawlerId);
        if (!crawler) return res.status(404).json({ error: `Crawler ${crawlerId} not found` });

        // 2. Scrape one article
        const article = await crawler.crawlRandomArticle();

        // 3. Generate the draft using your EXISTING aiService method!
        const trackingString = `?utm_source=bluesky&utm_medium=social&utm_campaign=ai_${encodeURIComponent(crawlerId.replace(/\s+/g, '_'))}`;
        const finalUrl = await shortenUrl(article.url + trackingString);
        const posts = await generateInitialDraft(article.title, article.excerpt || '', finalUrl);

        for (let i = 0; i < posts.length; i++) {
            const currentPost = posts[i];

            if (currentPost && currentPost.length > 300) {
                // Now we safely pass 'currentPost' instead of 'posts[i]'
                const newText = await condensePost(currentPost, 'Make it more concise under 200 chars.');
                if (newText) posts[i] = newText;
            }
        }

        res.json({
            article: {
                ...article,
                sourceName: crawlerId
            },
            posts
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Catch-all: Route any unknown requests to the React frontend
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'client/index.html'));
});
// that didn't match the /api routes above it.
// app.use((req, res, next) => {
//     // If it's a GET request (like a user typing a URL in the browser), serve the React App
//     if (req.method === 'GET') {
//         res.sendFile(path.join(process.cwd(), 'client/dist/index.html'));
//     } else {
//         // Otherwise, it's a bad API request
//         res.status(404).json({ error: "Endpoint not found" });
//     }
// });

// Start the server
app.listen(PORT, async () => {
    // Initialize the database (Postgres OR SQLite) before accepting traffic
    await historyService.init();

    console.log(`🌐 API Server is running on http://localhost:${PORT}`);
    console.log(`Use 'npx tsx src/index.ts' if you want to run the CLI instead!`);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
const shutdown = async () => {
    console.log('\n🛑 Shutting down gracefully...');
    cronService.stop();         // 1. Stop the cron engine from starting new jobs
    await historyService.close();     // 2. Safely close the database to prevent corruption
    process.exit(0);            // 3. Exit safely
};

// Listen for Ctrl+C or Cloud Provider termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);