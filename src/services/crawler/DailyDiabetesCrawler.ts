import { WordPressCrawler } from './WordPressCrawler.js';

export class DailyDiabetesCrawler extends WordPressCrawler {
    constructor() {
        super('https://dailydiabetesnews.com');
    }
}