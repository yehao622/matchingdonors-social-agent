import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';

// 1. Define a simple in-memory interface (Replacing the old DB Model)
export interface ScrapedArticle {
    title: string;
    content: string;
    excerpt: string;
    url: string;
}

export abstract class BaseCrawler {
    protected baseUrl: string;
    protected timeout: number = 20000;
    protected userAgent: string = 'MatchingDonors-ContentAgent-Demo';

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    abstract extractArticleLinks(html: string): string[];
    abstract extractArticleContent(html: string, url: string): Partial<ScrapedArticle>;

    protected async fetchHtml(url: string): Promise<string> {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                },
                timeout: this.timeout,
                maxRedirects: 5,
            });
            return response.data;
        } catch (error) {
            console.error(`✗ Error fetching ${url}`);
            throw error;
        }
    }

    protected normalizeUrl(href: string): string {
        if (href.startsWith('http://') || href.startsWith('https://')) return href;
        if (href.startsWith('//')) return 'https:' + href;
        if (href.startsWith('/')) return this.baseUrl + href;
        return this.baseUrl + '/' + href;
    }

    async crawlIndex(): Promise<string[]> {
        const html = await this.fetchHtml(this.baseUrl);
        const links = this.extractArticleLinks(html);
        return [...new Set(links)].filter(link => {
            try { new URL(link); return true; } catch { return false; }
        });
    }

    async crawlArticle(url: string): Promise<ScrapedArticle> {
        const html = await this.fetchHtml(url);
        const articleData = this.extractArticleContent(html, url);

        if (!articleData.title || !articleData.content) {
            throw new Error('Article title or content is missing');
        }

        return {
            title: articleData.title,
            content: articleData.content,
            excerpt: articleData.excerpt || this.generateExcerpt(articleData.content),
            url: url
        };
    }

    protected generateExcerpt(content: string, maxLength: number = 200): string {
        const cleaned = content.trim().replace(/\s+/g, ' ');
        return cleaned.length <= maxLength ? cleaned : cleaned.substring(0, maxLength).trim() + '...';
    }

    protected cleanText(text: string): string {
        return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
    }

    protected loadHtml(html: string): cheerio.CheerioAPI {
        return cheerio.load(html);
    }
}

export class DailyTransplantCrawler extends BaseCrawler {
    constructor() {
        super('https://dailytransplantnews.com');
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