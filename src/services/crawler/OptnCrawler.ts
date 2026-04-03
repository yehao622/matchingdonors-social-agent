import * as cheerio from 'cheerio';
import { BaseCrawler } from './BaseCrawler.js';
import { ScrapedArticle } from './BaseCrawler.js';

export class OptnCrawler extends BaseCrawler {
    constructor() {
        super('https://www.hrsa.gov/optn/news-events/news');
    }

    public async crawlRandomArticle() {
        const links = await this.crawlIndex();
        if (links.length === 0) throw new Error('No articles found on HRSA/OPTN.');

        const randomIndex = Math.floor(Math.random() * links.length);
        const randomArticleUrl = links[randomIndex];

        if (!randomArticleUrl) throw new Error('Failed to select article.');
        return this.crawlArticle(randomArticleUrl);
    }

    extractArticleLinks(html: string): string[] {
        const $ = this.loadHtml(html);
        const links: string[] = [];

        // Using the exact DOM structure from your screenshot!
        $('.views-field-title a').each((_, element) => {
            const href = $(element).attr('href');
            if (!href) return;

            let fullUrl = '';
            if (href.startsWith('http')) {
                fullUrl = href; // It's already a full link
            } else {
                // Ensure there's exactly one slash between the domain and the path
                fullUrl = 'https://www.hrsa.gov' + (href.startsWith('/') ? href : '/' + href);
            }

            // Let our strict URL filter decide if it's an article
            if (this.isArticleUrl(fullUrl)) {
                if (!links.includes(fullUrl)) {
                    links.push(fullUrl);
                }
            }
        });

        return links;
    }

    extractArticleContent(html: string, url: string): Partial<ScrapedArticle> {
        const $ = this.loadHtml(html);

        let title = '';
        const titleSelectors = ['h1', '.page-title', '.usa-prose h1', '#main-content h1'];
        for (const selector of titleSelectors) {
            const titleElem = $(selector).first();
            if (titleElem.length > 0 && titleElem.text().trim().length > 0) {
                title = this.cleanText(titleElem.text());
                break;
            }
        }
        if (!title) throw new Error('Could not extract HRSA/OPTN article title');

        let content = '';
        const contentSelectors = ['.main-content', '.usa-prose', 'article', '.content', '#main-content'];
        for (const selector of contentSelectors) {
            const contentElem = $(selector).first().clone();
            if (contentElem.length > 0) {
                contentElem.find('script, style, nav, .sidebar, .usa-button, header, footer').remove();
                content = this.cleanText(contentElem.text());
                if (content.length > 100) break;
            }
        }
        if (!content) throw new Error('Could not extract HRSA/OPTN article content');

        return {
            title,
            content,
            excerpt: this.generateExcerpt(content)
        };
    }

    private isArticleUrl(url: string): boolean {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();

            if (urlObj.hostname !== new URL(this.baseUrl).hostname) return false;

            // The path MUST contain the full /news-events/news/ structure
            if (!path.includes('/optn/news-events/news/')) return false;

            // Exclude the news hub homepage itself
            if (path === '/optn/news-events/news' || path === '/optn/news-events/news/') return false;

            // Exclude pagination
            if (path.includes('?page=')) return false;

            return true;
        } catch {
            return false;
        }
    }
}