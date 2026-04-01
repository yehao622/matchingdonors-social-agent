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