import * as cheerio from 'cheerio';
import { BaseCrawler, ScrapedArticle } from './BaseCrawler.js';

export class DailyTransplantCrawler extends BaseCrawler {
    constructor() {
        super('https://dailytransplantnews.com');
    }

    public async crawlRandomArticle() {
        const links = await this.crawlIndex();
        if (links.length === 0) throw new Error('No articles found.');

        const randomIndex = Math.floor(Math.random() * links.length);
        const randomArticleUrl = links[randomIndex];

        if (!randomArticleUrl) throw new Error('Failed to select article.');
        return this.crawlArticle(randomArticleUrl);
    }

    extractArticleLinks(html: string): string[] {
        const $ = this.loadHtml(html);
        const links: string[] = [];
        const selectors = ['article a', '.entry-title a', '.post-title a', 'h2 a'];

        selectors.forEach(selector => {
            $(selector).each((_, element) => {
                const href = $(element).attr('href');
                if (href) {
                    const fullUrl = this.normalizeUrl(href);
                    if (this.isArticleUrl(fullUrl)) links.push(fullUrl);
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
        const selectors = ['h1.entry-title', 'h1.post-title', 'article h1', 'h1'];
        for (const selector of selectors) {
            const titleElem = $(selector).first();
            if (titleElem.length > 0 && titleElem.text().trim().length > 0) {
                return this.cleanText(titleElem.text());
            }
        }
        throw new Error('Could not extract article title');
    }

    private extractContent($: cheerio.CheerioAPI): string {
        const selectors = ['.entry-content', '.post-content', 'article .content', 'article'];
        for (const selector of selectors) {
            const contentElem = $(selector).first().clone();
            if (contentElem.length > 0) {
                contentElem.find('script, style, .social-share, .advertisement').remove();
                const content = this.cleanText(contentElem.text());
                if (content.length > 100) return content;
            }
        }
        throw new Error('Could not extract article content');
    }

    private isArticleUrl(url: string): boolean {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();
            const excludePatterns = ['/category/', '/tag/', '/author/', '/page/', '/contact', '/about'];

            if (excludePatterns.some(pattern => path.includes(pattern))) return false;
            if (urlObj.hostname !== new URL(this.baseUrl).hostname) return false;
            if (path === '/' || path === '') return false;

            return true;
        } catch {
            return false;
        }
    }
}