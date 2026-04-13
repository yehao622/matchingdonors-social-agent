import * as cheerio from 'cheerio';
import { BaseCrawler, ScrapedArticle } from './BaseCrawler.js';

export abstract class WordPressCrawler extends BaseCrawler {

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

        const selectors = [
            'article a',
            '.entry-title a',
            '.post-title a',
            'h2 a',
            'h3 a',
            '.article-title a',
            'article h2 a',
            '.post a.more-link',
        ];

        selectors.forEach(selector => {
            $(selector).each((_, element) => {
                const href = $(element).attr('href');
                if (href) {
                    const fullUrl = this.normalizeUrl(href);
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

    protected extractTitle($: cheerio.CheerioAPI): string {
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

    protected extractContent($: cheerio.CheerioAPI): string {
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
                contentElem.find('script, style, .social-share, .advertisement, .ads, .share-buttons, .related-posts, .author-bio').remove();

                const content = this.cleanText(contentElem.text());
                if (content.length > 100) {
                    return content;
                }
            }
        }

        throw new Error('Could not extract article content');
    }

    protected isArticleUrl(url: string): boolean {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname.toLowerCase();

            const excludePatterns = [
                '/category/', '/tag/', '/author/', '/page/', '/search/',
                '/wp-admin/', '/wp-content/', '/feed/', '/rss/',
                '/about', '/contact', '/privacy', '/terms', '/register',
                '/reviews-guidelines', '/amp/',
                '.jpg', '.png', '.pdf', '.css', '.js',
            ];

            for (const pattern of excludePatterns) {
                if (path.includes(pattern)) {
                    return false;
                }
            }

            if (urlObj.hostname !== new URL(this.baseUrl).hostname) {
                return false;
            }

            if (path === '/' || path === '') {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }
}