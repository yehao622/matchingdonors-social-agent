import cron from 'node-cron';
import { crawlerManager } from './CrawlerManager.js';
import { generateInitialDraft, condensePost } from './aiService.js';
import { publishThreadToBluesky } from './socialService.js';
import { shortenUrl } from './urlService.js';
import { historyService } from './HistoryService.js';

class CronService {
    private task: cron.ScheduledTask | null = null;
    public isRunning: boolean = false;
    public currentStatus: string = 'Idle (Engine Stopped)';

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.currentStatus = 'Cron Engine Started! Waiting for next cycle...';

        this.task = cron.schedule('* * * * *', async () => {
            await this.runWorkflow();
        });

        console.log('⏱️ Cron engine started!');
    }

    public stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
        this.isRunning = false;
        this.currentStatus = 'Idle (Engine Stopped)';
        console.log('🛑 Cron engine stopped!');
    }

    // Pauses the backend, but instantly aborts if the human stops the engine
    private async smartDelay(seconds: number, countdownMessage?: string): Promise<boolean> {
        for (let i = seconds; i > 0; i--) {
            // If human clicked "Take Control", this.isRunning becomes false and we abort!
            if (!this.isRunning) return false;

            if (countdownMessage) {
                this.currentStatus = `${countdownMessage} ${i}s...`;
            }
            // Wait exactly 1 second
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return this.isRunning;
    }

    // This is the fully automated pipeline (No humans required!)
    private async runWorkflow() {
        this.currentStatus = 'Crawling for an article...';

        try {
            // 1. Scrape (Round-Robin skips duplicates automatically!)
            const article = await crawlerManager.fetchOneArticleFromSources();

            // Tell the UI we succeeded, and hold for 4 seconds so the user can see it
            this.currentStatus = `✅ Article found! Syncing UI...`;
            const proceed1 = await this.smartDelay(4);
            if (!proceed1) return; // Abort if human intervened!

            // Shorten URL
            this.currentStatus = `Shortening URL for ${article.sourceName}...`;
            const finalUrl = await shortenUrl(article.url);

            // Draft with Gemini
            this.currentStatus = 'Drafting with Gemini...';

            // Provide fallback strings just in case the crawler missed the title or excerpt
            const safeTitle = article.title || 'Medical News';
            const safeExcerpt = article.excerpt || '';

            let posts = (await generateInitialDraft(safeTitle, safeExcerpt, finalUrl)) || [];
            if (posts.length === 0) {
                console.log('⚠️ Gemini returned no posts. Skipping to next cycle.');
                this.currentStatus = 'Skipped: No drafts generated.';
                return;
            }

            // Auto-Fix any posts that exceed 300 characters
            this.currentStatus = 'Condensing long posts...';
            for (let i = 0; i < posts.length; i++) {
                const currentPost = posts[i];

                if (currentPost && currentPost.length > 300) {
                    console.log(`⚙️ Cron Engine: Condensing post ${i + 1}...`);
                    const newText = await condensePost(currentPost, 'Make it more concise under 200 chars.');
                    if (newText) posts[i] = newText;
                }
            }

            // Hold for 30 seconds. The UI will display this exact countdown.
            const proceed2 = await this.smartDelay(30, `⏳ Drafts ready! Auto-publishing in`);
            if (!proceed2) return; // Abort if human clicked "Take Control"!

            // Publish & Save to Database
            this.currentStatus = 'Publishing to Bluesky...';
            const validPosts = posts.filter(p => p.trim().length > 0);

            if (validPosts.length > 0) {
                await publishThreadToBluesky(validPosts);
                historyService.markArticleCrawled(article.sourceName, article.url);
                console.log(`✅ Cron Engine: Successfully published & recorded ${article.url}`);
                this.currentStatus = `Sleeping. Last published from ${article.sourceName}.`;
            } else {
                this.currentStatus = 'Skipped publishing: No valid posts generated.';
            }

        } catch (error) {
            console.error('❌ Cron execution error:', error);
            this.currentStatus = 'Error occurred during last run. Waiting for next cycle...';
        }
    }
}

// Export as a singleton so we only ever have ONE cron clock ticking!
export const cronService = new CronService();