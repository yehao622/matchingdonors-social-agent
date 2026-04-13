import { WordPressCrawler } from './WordPressCrawler.js';

export class DailyTransplantCrawler extends WordPressCrawler {
    constructor() {
        super('https://dailytransplantnews.com');
    }
}