import cron from 'node-cron';
import { crawlerManager } from './CrawlerManager.js';
import { generateInitialDraft, condensePost } from './aiService.js';
import { publishThreadToBluesky, BlueskyPost } from './socialService.js';
import { historyService } from './HistoryService.js';
import { getTopButtonAction } from './ga4Sanitizer.js';
import { experimentService, ExperimentRecord } from './ExperimentService.js';
import { banditService } from './BanditService.js';

class CronService {
    private task: cron.ScheduledTask | null = null;
    public isRunning: boolean = false;
    public currentStatus: string = 'Idle (Engine Stopped)';

    public pendingArticle: any = null;
    public pendingDrafts: string[] = [];

    private isProcessing: boolean = false;

    private targetSeoKeywords: string[] = [
        "kidney donor match",
        "find a living donor",
        "organ transplant resources",
        "how to find a kidney donor match"
    ];
    private keywordIndex: number = 0;

    // Tracks how many posts have been published today, resets at midnight
    private dailyPostCount: number = 0;
    private lastResetDate: string = '';
    // Stored as [hour, minute] pairs — asymmetric to feel human
    private readonly DAILY_SCHEDULE: [number, number][] = [
        [9, 7],   // 9:07 AM
        [11, 23], // 11:23 AM
        [13, 41], // 1:41 PM
        [15, 5],  // 3:05 PM
        [17, 52], // 5:52 PM
    ];
    private readonly MAX_POSTS_PER_DAY = 5;

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.currentStatus = 'Cron Engine Started! Waiting for next cycle...';

        this.task = cron.schedule('* * * * *', async () => {
            // Reset daily counter at midnight
            const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
            if (this.lastResetDate !== today) {
                this.dailyPostCount = 0;
                this.lastResetDate = today;
                console.log('Daily post counter reset.');
            }

            // Stop for the day once we hit the limit
            if (this.dailyPostCount >= this.MAX_POSTS_PER_DAY) {
                this.currentStatus = `✅ Daily limit reached (${this.MAX_POSTS_PER_DAY} posts). Resuming tomorrow.`;
                return;
            }

            // Only fire at the exact scheduled [hour, minute] slots
            const now = new Date();
            const hh = now.getHours();
            const mm = now.getMinutes();
            const isScheduledSlot = this.DAILY_SCHEDULE.some(([h, m]) => h === hh && m === mm);
            if (!isScheduledSlot) return;

            // THE LOCK: If a workflow is already running, skip this minute!
            if (this.isProcessing) {
                console.log('⏳ Previous cycle is still running. Skipping this minute to prevent overlap.');
                return;
            }

            this.isProcessing = true;
            try {
                await this.runWorkflow();
                this.dailyPostCount++;
                console.log(`📊 Daily post count: ${this.dailyPostCount}/${this.MAX_POSTS_PER_DAY}`);
            } finally {
                this.isProcessing = false; // Unlock the door when completely finished or if it crashes!
            }
        });

        console.log('⏱️ Cron engine started! Posting 5x/day on working-hours schedule.');
    }

    public stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
        this.isRunning = false;
        this.isProcessing = false;
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

    // Read GA4 data to find the best topic ---
    private getPerformanceHint(): string {
        const topAction = getTopButtonAction(); // sanitized — dev/bot rows already stripped
        if (!topAction) return '';
        return `Our analytics show that website visitors are currently highly engaged with the "${topAction}" feature. Try to subtly frame the emotional angle or call-to-action of this post to encourage readers to explore that specific area of the site.`;
    }

    // This is the fully automated pipeline (No humans required!)
    private async runWorkflow() {
        this.currentStatus = 'Checking pending bandit rewards...';

        try {
            await banditService.resolvePendingRewards();
            this.currentStatus = 'Crawling for an article...';
            // 1. Scrape (Round-Robin skips duplicates automatically!)
            const article = await crawlerManager.fetchOneArticleFromSources();
            const prefix = `[${article.sourceName}]`;

            // Cache article
            this.pendingArticle = article;

            // Tell the UI we succeeded, and hold for 4 seconds so the user can see it
            this.currentStatus = `${prefix} ✅ Article found! Syncing UI...`;
            const proceed1 = await this.smartDelay(4);
            if (!proceed1) return; // Abort if human intervened!

            // 60-second delay to protect gemini api
            this.currentStatus = `${prefix} ⏳ Waiting 30s to avoid Gemini API rate limits...`;
            const proceedDraft = await this.smartDelay(30);
            if (!proceedDraft) return;

            const trendingSEOKeyword = this.targetSeoKeywords[this.keywordIndex] || "organ donation";
            console.log(`Injecting GSC Target Keyword: "${trendingSEOKeyword}"`);
            this.keywordIndex = (this.keywordIndex + 1) % this.targetSeoKeywords.length;

            const currentSlotHour = new Date().getHours();

            const banditDecision = await banditService.chooseAction({
                relevanceScore: article.relevanceScore ?? 0,
                sourceName: article.sourceName,
                seoKeyword: trendingSEOKeyword,
                slotHour: currentSlotHour,
            });

            const actionPlan = banditService.getActionExecutionPlan(banditDecision.actionKey);
            const isLinklessPost = actionPlan.forceLinkless;
            const wantTwoPart = actionPlan.forceThread;

            console.log(
                `🎯 Bandit decision: action=${banditDecision.actionKey} | context=${banditDecision.contextBucket} | explore=${banditDecision.epsilonUsed}`
            );

            // Grab the Analytics Feedback ---
            const performanceHint = this.getPerformanceHint();
            if (performanceHint) {
                console.log(`Injecting GA4 Success Bias based on historical data!`);
            }

            // Draft with Gemini
            this.currentStatus = `${prefix} Drafting with Gemini...`;

            // Provide fallback strings just in case the crawler missed the title or excerpt
            const safeTitle = article.title || 'Medical News';
            const safeExcerpt = article.excerpt || '';
            // const isLinklessPost = Math.random() < 1 / 3;
            // const wantTwoPart = !isLinklessPost && Math.random() < 0.5;

            let drafts = (await generateInitialDraft(
                safeTitle,
                safeExcerpt,
                trendingSEOKeyword,
                performanceHint,
                wantTwoPart
            )) || [];
            if (drafts.length === 0) {
                console.log('⚠️ Gemini returned no posts. Skipping to next cycle.');
                this.currentStatus = 'Skipped: No drafts generated.';
                return;
            }

            if (actionPlan.forceThread && drafts.length > 2) {
                drafts = drafts.slice(0, 2);
            }

            if (!actionPlan.forceThread && drafts.length > 1) {
                const firstDraft = drafts[0];
                if (firstDraft) {
                    drafts = [firstDraft];
                }
            }

            // Auto-Fix any posts that exceed 300 characters
            this.currentStatus = `${prefix} Optimizing and shortening embedded links...`;
            for (let i = 0; i < drafts.length; i++) {
                let postObj = drafts[i];
                if (!postObj || !postObj.text) continue;

                if (postObj.text.length > 300) {
                    console.log(`⚙️ Cron Engine: Condensing base text of post ${i + 1}...`);
                    const newText = await condensePost(postObj.text, 'Make it more concise, strictly under 300 chars.');
                    if (newText) postObj.text = newText;
                }
            }

            const posts: BlueskyPost[] = [];
            for (let i = 0; i < drafts.length; i++) {
                const posts_tmp = drafts[i];
                if (!posts_tmp || !posts_tmp.text) continue;

                let { text, code } = posts_tmp;

                if (isLinklessPost) {
                    // Pure insight post — no URLs attached, no facets. Just the Gemini text + hashtags.
                    posts.push({ text });
                } else {
                    // Post 1 of a 2-part thread → MatchingDonors label
                    // Final post (1-of-1, or post 2 of 2) → source article label
                    const isMatchingDonorsPost = drafts.length === 2 && i === 0;

                    const linkLabel = isMatchingDonorsPost ? '→ MatchingDonors' : '→ Read Article';
                    const linkUri = isMatchingDonorsPost
                        ? `https://matchingdonors.com/life/?utm_source=bsky&utm_medium=soc&utm_campaign=${code}`
                        : `${article.url}?utm_source=bsky&utm_medium=soc&utm_campaign=${code}`;

                    // Visible post text: Gemini text + newline + short label
                    const fullText = `${text}\n\n${linkLabel}`;

                    posts.push({
                        text: fullText,
                        linkFacets: [{ label: linkLabel, uri: linkUri }],
                    });
                }
            }

            // Cache drafts
            this.pendingDrafts = posts.map(p => p.text);

            // Hold for 30 seconds. The UI will display this exact countdown.
            const proceed2 = await this.smartDelay(30, `${prefix} ⏳ Drafts ready! Auto-publishing in`);
            if (!proceed2) return; // Abort if human clicked "Take Control"!

            // Publish & Save to Database
            this.currentStatus = `${prefix} Publishing to Bluesky...`;
            const validPosts = posts.filter(p => p.text && p.text.trim().length > 0);

            // All-or-nothing publishing & history protection
            if (validPosts.some(p => p.text.length > 300)) {
                console.log(`⚠️ Aborting publish: Some posts are still over 300 chars after condensing.`);
                this.currentStatus = 'Skipped: Posts exceeded character limits. Will retry later.';
                // Return immediately! The thread is NOT published, and History is NOT saved!
                return;
            }

            if (validPosts.length > 0) {
                await publishThreadToBluesky(validPosts);
                await historyService.markArticleCrawled(article.title || 'Medical News', article.sourceName, article.url);

                // --- Experiment logging ---
                // archetype_code: use the first draft's code as representative of the whole thread
                const representativeCode = drafts[0]?.code || 'ai_general';
                const publishedAt = new Date().toISOString();
                const experimentRecord: ExperimentRecord = {
                    archetype_code: representativeCode,
                    thread_type: drafts.length > 1 ? 'thread' : 'single',
                    is_linkless: isLinklessPost,
                    slot_hour: currentSlotHour,
                    source_domain: new URL(article.url).hostname,
                    article_url: article.url,
                    article_title: article.title || 'Medical News',
                    seo_keyword: trendingSEOKeyword,
                    relevance_score: article.relevanceScore ?? 0,
                    engagement_score: article.engagementScore ?? 0,
                    published_at: publishedAt,
                };
                await experimentService.logExperiment(experimentRecord);
                await banditService.logPendingDecision({
                    articleUrl: article.url,
                    contextBucket: banditDecision.contextBucket,
                    actionKey: banditDecision.actionKey,
                    publishedAt: experimentRecord.published_at,
                });

                console.log(`✅ Cron Engine: Successfully published & recorded ${article.url}`);
                this.currentStatus = `Sleeping. Last published from ${article.sourceName}.`;

                // Clear cahce
                this.pendingArticle = null;
                this.pendingDrafts = [];
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