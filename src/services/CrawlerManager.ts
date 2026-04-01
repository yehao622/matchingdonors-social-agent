import { DailyTransplantCrawler } from './crawler/DailyTransplantCrawler.js';
import { IrishTransplantCrawler } from './crawler/IrishTransplantCrawler.js';
import { DailyDiabetesCrawler } from './crawler/DailyDiabetesCrawler.js';
import { PubMedCrawler } from './crawler/PubMedCrawler.js';
import { PlosCrawler } from './crawler/PlosCrawler.js';

export class CrawlerManager {
    private crawlers: any[];

    constructor() {
        // Register all available sources here!
        this.crawlers = [
            new DailyTransplantCrawler(),
            new IrishTransplantCrawler(),
            new DailyDiabetesCrawler(),
            new PubMedCrawler(),
            new PlosCrawler()
        ];
    }

    public async fetchRandomArticleFromAnySource() {
        // 1. Pick a random crawler from our registered list
        const randomIndex = Math.floor(Math.random() * this.crawlers.length);
        const selectedCrawler = this.crawlers[randomIndex];

        console.log(`🤖 Crawler Manager routing request to: ${selectedCrawler.constructor.name}`);

        // 2. Execute it and return the standard Article object
        try {
            return await selectedCrawler.crawlRandomArticle();
        } catch (error) {
            console.error(`⚠️ ${selectedCrawler.constructor.name} failed. Attempting fallback...`);
            // If a crawler fails (e.g., website is down), we could recursively try another one here!
            throw error;
        }
    }
}