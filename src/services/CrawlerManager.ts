import { DailyTransplantCrawler } from './crawler/DailyTransplantCrawler.js';
import { IrishTransplantCrawler } from './crawler/IrishTransplantCrawler.js';
import { DailyDiabetesCrawler } from './crawler/DailyDiabetesCrawler.js';
import { PubMedCrawler } from './crawler/PubMedCrawler.js';
import { PlosCrawler } from './crawler/PlosCrawler.js';
import { OptnCrawler } from './crawler/OptnCrawler.js';
import { historyService } from './HistoryService.js';

export interface ICrawler {
    crawlRandomArticle(): Promise<{ title: string; excerpt: string; url: string; content?: string }>;
}

export class CrawlerManager {
    private crawlers: ICrawler[];
    private currentIndex: number = 0;

    constructor() {
        // Register all available sources here!
        this.crawlers = [
            new OptnCrawler(),
            new DailyTransplantCrawler(),
            new IrishTransplantCrawler(),
            new DailyDiabetesCrawler(),
            new PubMedCrawler(),
            new PlosCrawler()
        ];
    }

    public async fetchOneArticleFromSources(): Promise<{
        title: string;
        excerpt: string;
        url: string;
        content?: string;
        sourceName: string
    }> {
        let attempts = 0;
        const maxAttempts = this.crawlers.length;

        while (attempts < maxAttempts) {
            attempts++;

            const selectedCrawler = this.crawlers[this.currentIndex];
            if (!selectedCrawler) {
                console.warn('⚠️ Encountered undefined crawler in array. Skipping.');
                continue;
            }

            this.currentIndex = (this.currentIndex + 1) % this.crawlers.length;

            console.log(` [Attempt ${attempts}] routing to: ${selectedCrawler.constructor.name}`);

            try {
                const articleData = await selectedCrawler.crawlRandomArticle();

                if (await historyService.isArticleCrawled(articleData.url)) {
                    console.log(`Already published previously. Skipping: ${articleData.url}`);
                    continue;
                }

                // If it's a fresh, never-before-seen article!
                // We attach the source name so we can record it properly later.
                return {
                    ...articleData,
                    sourceName: selectedCrawler.constructor.name
                };

            } catch (error: any) {
                console.error(`⚠️ ${selectedCrawler.constructor.name} failed. Reason: ${error.message}`);
            }
        }

        throw new Error('Could not find any fresh articles after multiple attempts.');
    }

    public getCrawlerById(crawlerId: string) {
        return this.crawlers.find(c => c.constructor.name === crawlerId);
    }
}

export const crawlerManager = new CrawlerManager();