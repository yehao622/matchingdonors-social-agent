import * as cheerio from 'cheerio';
import { BaseCrawler, ScrapedArticle } from './BaseCrawler.js';

export class DailyDiabetesCrawler extends BaseCrawler {
    constructor() {
        super('https://dailydiabetesnews.com');
    }

    public async crawlRandomArticle() {
        const links = await this.crawlIndex();
        if (links.length === 0) throw new Error('No articles found.');

        const randomIndex = Math.floor(Math.random() * links.length);
        const randomArticleUrl = links[randomIndex];

        if (!randomArticleUrl) throw new Error('Failed to select article.');
        return this.crawlArticle(randomArticleUrl);
    }

    // Extract article links from DailyDiabetesNews homepage (selectors may need adjustment basd on each specific site structure)
    extractArticleLinks(html: string): string[] {
        const $ = this.loadHtml(html);
        const links: string[] = [];

        // Common WordPress/news site selectors, adjust these selectors after inspecting the actual site
        const selectors = [
            'article a',           // WordPress standard
            '.entry-title a',                      // Common theme pattern
            '.post-title a',                       // Alternative pattern
            'h2 a',                                // Specific heading pattern
            'h3 a',
            '.article-title a',                    // Generic article pattern
            'article h2 a',                        // Article heading links
            '.post a.more-link',                   // "Read more" links
        ];

        // Site-specific selector - inspect site to find correct selector
        selectors.forEach(selector => {
            $(selector).each((_, element) => {
                const href = $(element).attr('href');
                if (href) {
                    // handle relative vs absolute Urls
                    const fullUrl = this.normalizeUrl(href);

                    // Filter out non-article URLs (categories, tags, author pages, etc.)
                    if (this.isArticleUrl(fullUrl)) {
                        links.push(fullUrl);
                    }
                }
            });
        });

        return links;
    }

    extractArticleContent(html: string, url: string): Partial<ScrapedArticle> {
        const $ = this.loadHtml(html);
        const content = this.extractContent($);

        return {
            title: this.extractTitle($),
            content: content,
            excerpt: this.generateExcerpt(content),
            url: url
        };
    }

    private extractTitle($: cheerio.CheerioAPI): string {
        const selectors = [
            'h1.entry-title',
            'h1.post-title',
            'article h1',
            'h1.article-title',
            '.page-title h1',
            'h1',
        ];

        for (const selector of selectors) {
            const titleElem = $(selector).first();
            if (titleElem.length > 0) {
                const title = this.cleanText(titleElem.text());
                if (title.length > 0) {
                    return title;
                }
            }
        }

        throw new Error('Could not extract article title');
    }

    // Extract article content with multiple fallback selectors
    private extractContent($: cheerio.CheerioAPI): string {
        const selectors = [
            '.entry-content',
            '.post-content',
            'article .content',
            '.article-content',
            'article',
            'main',
        ];

        for (const selector of selectors) {
            const contentElem = $(selector).first().clone();
            if (contentElem.length > 0) {
                // Remove unwanted elements
                contentElem.find('script, style, .social-share, .advertisement, .ads, .share-buttons, .related-posts, .author-bio').remove();

                const content = this.cleanText(contentElem.text());
                if (content.length > 100) {
                    return content; // Ensure meaninful content return
                }
            }
        }

        throw new Error('Could not extract artile content');
    }

    // Check if URL is likely an article (not category, tag, author page, etc)
    private isArticleUrl(url: string): boolean {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();

            // Exclude common no-article paths
            const excludePatterns = [
                '/category/',
                '/tag/',
                '/author/',
                '/page/',
                '/search/',
                '/wp-admin/',
                '/wp-content/',
                '/feed/',
                '/rss/',
                '/about',
                '/contact',
                '/privacy',
                '/terms',
                '/register',
                '/reviews-guidelines',
                '/amp/',
                '.jpg',
                '.png',
                '.pdf',
                '.css',
                '.js',
            ];

            for (const pattern of excludePatterns) {
                if (path.includes(pattern)) {
                    return false;
                }
            }

            // Must be from the same domain
            if (urlObj.hostname !== new URL(this.baseUrl).hostname) {
                return false;
            }

            // Must have some path (not just homepage)
            if (path === '/' || path === '') {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }
}