import { WordPressCrawler } from './WordPressCrawler.js';

export class IrishTransplantCrawler extends WordPressCrawler {
    constructor() {
        super('https://irishdailytransplantnews.com');
    }
}