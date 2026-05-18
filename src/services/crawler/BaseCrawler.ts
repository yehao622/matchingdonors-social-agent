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
    protected maxRetries: number = 3;
    protected baseDelayMs: number = 2000;
    protected userAgent: string = 'MatchingDonors-ContentAgent-Demo';

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    abstract extractArticleLinks(html: string): string[];
    abstract extractArticleContent(html: string, url: string): Partial<ScrapedArticle>;

    // Helper to pause execution
    protected sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    protected async fetchHtml(url: string, retries: number = 0): Promise<string> {
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
        } catch (error: any) {
            const status = error.response?.status;
            
            // Check if error is retryable (429 Rate Limit, or 5xx Server Error, or Timeout)
            const isRetryable = status === 429 || (status >= 500 && status < 600) || error.code === 'ECONNABORTED';

            if (isRetryable && retries < this.maxRetries) {
                // Calculate exponential backoff (2s, 4s, 8s) + a little random "jitter" so we don't spam exact seconds
                const jitter = Math.floor(Math.random() * 500);
                const waitTime = (this.baseDelayMs * Math.pow(2, retries)) + jitter;
                
                console.warn(`⚠️ Rate limited or server error fetching ${url} (Status: ${status}). Retrying in ${(waitTime / 1000).toFixed(1)}s... (Attempt ${retries + 1}/${this.maxRetries})`);
                
                await this.sleep(waitTime);
                return this.fetchHtml(url, retries + 1); // Recursive retry
            }

            console.error(`✗ Fatal Error fetching ${url} after ${retries} retries.`);
            throw error;
        }
    }

    protected async fetchApiJson(url: string, retries: number = this.maxRetries, baseDelay: number = this.baseDelayMs): Promise<any> {
        try {
            // Standard API fetch without the heavy HTML headers
            const response = await axios.get(url, { timeout: this.timeout });
            return response.data; // Return the parsed JSON
        } catch (error: any) {
            const status = error.response?.status;
            
            if ((status === 429 || (status >= 500 && status < 600)) && retries > 0) {
                const hostname = new URL(url).hostname; // Extract 'api.plos.org' or 'eutils.ncbi.nlm.nih.gov'
                const jitter = Math.floor(Math.random() * 500);
                const waitTime = baseDelay + jitter;
                
                console.warn(`⚠️ API Rate Limit hit on [${hostname}]. Retrying in ${(waitTime/1000).toFixed(1)}s...`);
                
                await this.sleep(waitTime);
                return this.fetchApiJson(url, retries - 1, baseDelay * 2); // Recursive retry
            }
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