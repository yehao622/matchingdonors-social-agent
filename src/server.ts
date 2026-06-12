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
import { banditService } from './services/BanditService.js';
import { experimentService } from './services/ExperimentService.js';
import { cronService } from './services/CronService.js';
import { loadCleanGA4Data } from './services/ga4Sanitizer.js';
import path from 'path';
import fs from 'fs';

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

        if (!Array.isArray(posts)) {
            return res.status(400).json({ error: 'Posts must be an array.' });
        }

        posts = posts
            .map((p: any) => {
                if (typeof p === 'string') {
                    const text = p.trim();
                    return text.length > 0 ? text : null;
                }

                if (p && typeof p === 'object' && typeof p.text === 'string') {
                    const text = p.text.trim();
                    if (text.length === 0) return null;

                    return {
                        text,
                        linkFacets: Array.isArray(p.linkFacets)
                            ? p.linkFacets
                                .filter((f: any) =>
                                    f &&
                                    typeof f.label === 'string' &&
                                    f.label.trim().length > 0 &&
                                    typeof f.uri === 'string' &&
                                    f.uri.trim().length > 0
                                )
                                .map((f: any) => ({
                                    label: f.label.trim(),
                                    uri: f.uri.trim(),
                                }))
                            : undefined,
                    };
                }

                return null;
            })
            .filter(Boolean);

        if (posts.length === 0) {
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
app.get('/api/history-enriched', async (req, res) => {
    try {
        const records = await historyService.getEnrichedHistory();
        res.json(records);
    } catch (error) {
        console.error('Enriched history fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch enriched history.' });
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

        // 3. Generate drafts — returns { text, code }[] objects now
        const rawDrafts = await generateInitialDraft(
            article.title || 'Medical News',
            article.excerpt || '',
            'organ donation'
        );

        const posts: string[] = [];

        for (let i = 0; i < rawDrafts.length; i++) {
            const draft = rawDrafts[i];
            if (!draft || !draft.text) continue;

            let text = typeof draft === 'string' ? draft : draft.text;
            const code = typeof draft === 'string' ? 'ai_general' : draft.code;

            // if (!text || typeof text !== 'string') continue;

            if (text.length > 300) {
                const newText = await condensePost(text, 'Make it more concise under 200 chars.');
                if (newText) text = newText;
            }

            let fullPost = text;

            if (rawDrafts.length === 2 && i === 0) {
                fullPost += `\n\nhttps://matchingdonors.com/life/?utm_source=bsky&utm_medium=soc&utm_campaign=${code}`;
            } else {
                fullPost += `\n\n${article.url}?utm_source=bsky&utm_medium=soc&utm_campaign=${code}`;
            }

            posts.push(fullPost);
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

// ANALYTICS API BRIDGE
app.get('/api/analytics', (req, res) => {
    try {
        const liveData = loadCleanGA4Data();

        if (liveData.length === 0) {
            return res.json([]);
        }

        // Transform the GA4 data into the format Recharts expects!
        const formattedData = liveData
            // focuses mostly on actual button clicks or major events
            .filter((row: any) => row['Event name'] !== 'page_view')
            .map((row: any) => ({
                // If it has a custom Button Name, use it. Otherwise, use the general Event name.
                name: row['Button Name'] && row['Button Name'] !== '(not set)'
                    ? row['Button Name']
                    : row['Event name'],
                //  Map the Y-Axis values (ensure they are parsed as numbers)
                inbound: Number(row['Event count']) || 0,
                // Let's temporarily map 'Total users' to the green line just so both lines render!
                outbound: Number(row['Total users']) || 0
            }));

        res.json(formattedData);
    } catch (error: any) {
        console.error("Analytics API Error:", error);
        res.status(500).json({ error: "Failed to fetch analytics data" });
    }
});

// Catch-all: Route any unknown requests to the React frontend
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'client/index.html'));
});

// Start the server
app.listen(PORT, async () => {
    // Initialize the database (Postgres OR SQLite) before accepting traffic
    await historyService.init();
    await experimentService.init();
    await banditService.init();

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
    await experimentService.close();
    await banditService.close();
    process.exit(0);            // 3. Exit safely
};

// Listen for Ctrl+C or Cloud Provider termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);