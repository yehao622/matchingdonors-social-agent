import { DailyTransplantCrawler } from './crawler/DailyTransplantCrawler.js';
import { IrishTransplantCrawler } from './crawler/IrishTransplantCrawler.js';
import { DailyDiabetesCrawler } from './crawler/DailyDiabetesCrawler.js';
import { PubMedCrawler } from './crawler/PubMedCrawler.js';
import { PlosCrawler } from './crawler/PlosCrawler.js';
import { OptnCrawler } from './crawler/OptnCrawler.js';
import { historyService } from './HistoryService.js';
import { isRelevantArticle, getArticleRelevanceScore } from './articleRelevanceService.js';
import { isHighEngagementCandidate, getArticleEngagementScore } from './postEngagementService.js';

export interface ICrawler {
    crawlRandomArticle(): Promise<{
        title: string;
        excerpt: string;
        url: string;
        content?: string
    }>;
}

export class CrawlerManager {
    private crawlers: ICrawler[];
    private currentIndex: number = 0;

    constructor() {
        // Register all available sources here!
        this.crawlers = [
            // new OptnCrawler(),
            // new DailyTransplantCrawler(),
            // new IrishTransplantCrawler(),
            new DailyDiabetesCrawler()
            // new PubMedCrawler(),
            // new PlosCrawler()
        ];
    }

    public async fetchOneArticleFromSources(): Promise<{
        title: string;
        excerpt: string;
        url: string;
        content?: string;
        sourceName: string;
        relevanceScore: number;
        engagementScore: number;
    }> {
        let attempts = 0;
        const maxAttempts = Math.min(Math.max(this.crawlers.length * 5, 5), 15);;

        while (attempts < maxAttempts) {
            attempts++;

            const selectedCrawler = this.crawlers[this.currentIndex];
            this.currentIndex = (this.currentIndex + 1) % this.crawlers.length;

            if (!selectedCrawler) {
                console.warn('⚠️ Encountered undefined crawler in array. Skipping.');
                continue;
            }

            console.log(` [Attempt ${attempts}] routing to: ${selectedCrawler.constructor.name}`);

            try {
                const articleData = await selectedCrawler.crawlRandomArticle();

                if (await historyService.isArticleCrawled(articleData.url)) {
                    console.log(`Already published previously. Skipping: ${articleData.url}`);
                    continue;
                }

                const relevanceScore = getArticleRelevanceScore(articleData);
                if (!isRelevantArticle(articleData)) {
                    console.log(
                        `[Relevance Filter] Skipping low-relevance article: "${articleData.title}" (score: ${relevanceScore})`
                    );
                    continue;
                }

                const engagementScore = getArticleEngagementScore(articleData);
                if (!isHighEngagementCandidate(articleData)) {
                    console.log(
                        `[Engagement Filter] Skipping low-engagement article: "${articleData.title}" (engagement: ${engagementScore})`
                    );
                    continue;
                }

                // If it's a fresh, never-before-seen and filtered article!
                // We attach the source name so we can record it properly later.
                return {
                    ...articleData,
                    sourceName: selectedCrawler.constructor.name,
                    relevanceScore,
                    engagementScore
                };

            } catch (error: any) {
                console.error(`⚠️ ${selectedCrawler.constructor.name} failed. Reason: ${error.message}`);
                continue;
            }
        }

        throw new Error('Could not find any fresh articles after multiple attempts.');
    }

    public getCrawlerById(crawlerId: string) {
        return this.crawlers.find(c => c.constructor.name === crawlerId);
    }
}

export const crawlerManager = new CrawlerManager();