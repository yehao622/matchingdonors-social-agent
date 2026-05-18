import axios from 'axios';
import { PubMedCrawler } from './services/crawler/PubMedCrawler.js';
import { PlosCrawler } from './services/crawler/PlosCrawler.js';

// ==========================================
// 1. MOCK THE NETWORK (No real internet calls)
// ==========================================
let attempt = 0;

// Override the default axios.get behavior globally
axios.get = async (url: string, config?: any) => {
    attempt++;
    console.log(`\n[Network Monitor] Intercepted request to: ${url.split('?')[0]}...`);
    
    // Force the first two requests to fail with a 429 error
    if (attempt <= 2) {
        console.log(`[Network Monitor] ❌ Simulating 429 Too Many Requests (Attempt ${attempt})`);
        const error: any = new Error('Mocked 429 Error');
        error.response = { status: 429 };
        throw error;
    }

    // Allow the third request to succeed with fake data
    console.log(`[Network Monitor] ✅ Simulating 200 OK (Attempt ${attempt})`);
    
    if (url.includes('esearch')) {
        return { data: { esearchresult: { idlist: ['9999999'] } } };
    }
    
    return { 
        data: { 
            response: { 
                docs: [
                    { id: '12345', title: 'Mocked PLOS Organ Transplant Study', abstract: ['This is a mock abstract.'] }
                ] 
            } 
        } 
    };
};

// ==========================================
// 2. RUN THE TEST
// ==========================================
async function runTest() {
    console.log("🚀 Starting Safe Backoff Test...");
    const crawler = new PlosCrawler();
    
    try {
        const result = await crawler.crawlRandomArticle();
        console.log("\n🎉 Crawler successfully recovered and fetched:");
        console.log(result);
    } catch (error) {
        console.error("\n💀 Crawler failed to recover:", error);
    }
}

runTest();
