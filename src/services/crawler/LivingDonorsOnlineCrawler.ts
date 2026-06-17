import { BaseCrawler, ScrapedArticle } from './BaseCrawler.js';

export class LivingDonorsOnlineCrawler extends BaseCrawler {
    constructor() {
        // Target a specific active board, e.g., "Living Donors" general discussion
        super('https://livingdonorsonline.org/ldosmf/index.php?board=2.0');
    }

    extractArticleLinks(html: string): string[] {
        const $ = this.loadHtml(html);
        const links = new Set<string>(); // Using a Set automatically prevents duplicate URLs

        // Broaden the selector to check all anchor tags
        $('a').each((_, element) => {
            const href = $(element).attr('href');

            // Check if it's a string and points to a forum thread
            if (typeof href === 'string' && href.includes('?topic=')) {

                // Strip session IDs, action/pagination flags (like ;prev_next), and anchors (#new)
                // Using '||' satisfies strict TypeScript checks for array indexed access
                const noSession = href.split('PHPSESSID')[0] || '';
                const noParams = noSession.split(';')[0] || '';
                const cleanUrl = noParams.split('#')[0] || '';

                // Only add valid strings
                if (cleanUrl) {
                    links.add(this.normalizeUrl(cleanUrl));
                }
            }
        });

        return Array.from(links);
    }

    extractArticleContent(html: string, url: string): Partial<ScrapedArticle> {
        const $ = this.loadHtml(html);

        // SMF thread title
        const title = $('div.nav a').last().text().trim() || $('title').text().replace(' - Living Donors Online!', '').trim();

        // Grab the very first post in the thread for triage
        const firstPostText = $('div.post').first().text().trim();

        return {
            title,
            content: this.cleanText(firstPostText),
            url
        };
    }

    async crawlRandomArticle() {
        const links = await this.crawlIndex();
        if (links.length === 0) throw new Error('No threads found on LDO.');

        // Pick top 5 most recent threads, shuffle, pick one (demo behavior)
        const recentLinks = links.slice(0, 5);
        const randomLink = recentLinks[Math.floor(Math.random() * recentLinks.length)];

        // Safety check to satisfy noUncheckedIndexedAccess in tsconfig
        if (!randomLink) {
            throw new Error('Failed to extract a valid link from LDO.');
        }

        return await this.crawlArticle(randomLink);
    }
}