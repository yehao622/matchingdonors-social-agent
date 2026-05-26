import { WordPressCrawler } from './WordPressCrawler.js';

export class DailyDiabetesCrawler extends WordPressCrawler {
    constructor() {
        super('https://dailydiabetesnews.com');
    }

    // Override the standard HTML front-page crawler to use the Rank Math XML Sitemap instead
    async crawlIndex(): Promise<string[]> {
        console.log(`🗺️ Fetching XML Sitemap Index for ${this.baseUrl}...`);
        
        try {
            // Step 1: Fetch the main sitemap index
            // (Using the inherited fetchHtml method since XML is just text)
            const sitemapIndexXml = await this.fetchHtml(`${this.baseUrl}/sitemap_index.xml`);
            
            // Step 2: Extract all the sub-sitemaps using a simple RegEx
            const subSitemapMatches = [...sitemapIndexXml.matchAll(/<loc>(.*?)<\/loc>/g)];
            const subSitemaps = subSitemapMatches
                .map(match => match[1])
                .filter(url => url.includes('post-sitemap')); // We only want articles, ignoring category/tag sitemaps
            
            let allArticleLinks: string[] = [];

            // Step 3: Fetch the first 2 or 3 post sitemaps to get a massive pool of articles.
            // (We slice it so we don't accidentally download 5,000 links into memory at once)
            for (const sitemapUrl of subSitemaps) {
                console.log(`📄 Parsing sub-sitemap: ${sitemapUrl}`);
                const postSitemapXml = await this.fetchHtml(sitemapUrl);
                
                const linkMatches = [...postSitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)];
                const links = linkMatches.map(match => match[1]);
                
                allArticleLinks.push(...links);
            }

            // Remove any potential duplicates
            const uniqueLinks = [...new Set(allArticleLinks)];
            console.log(`✅ Discovered ${uniqueLinks.length} total articles via XML Sitemaps!`);
            
            return uniqueLinks;

        } catch (error) {
            console.error(`❌ Failed to crawl XML sitemap for ${this.baseUrl}. Falling back to standard HTML crawl:`, error);
            // If the sitemap fails for any reason, safely fall back to the original method!
            return super.crawlIndex();
        }
    }
}