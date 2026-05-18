import axios from 'axios';
import { BaseCrawler } from './BaseCrawler.js';

export class PlosCrawler extends BaseCrawler {
    public async crawlRandomArticle() {
        // Search PLOS for organ transplant, requesting JSON format (wt=json) and specific fields (fl=id,title,abstract)
        const url = `http://api.plos.org/search?q=title:"organ transplant"&wt=json&fl=id,title,abstract&rows=10`;
        const res = await this.fetchApiJson(url);
        const docs = res.response?.docs;

        if (!docs || docs.length === 0) throw new Error('No PLOS articles found.');

        const randomDoc = docs[Math.floor(Math.random() * docs.length)];

        return {
            title: randomDoc.title,
            // PLOS abstracts are arrays, so we grab the first paragraph
            excerpt: randomDoc.abstract ? randomDoc.abstract[0] : 'Academic Journal abstract sourced from PLOS.',
            url: `https://journals.plos.org/plosone/article?id=${randomDoc.id}`
        };
    }
}