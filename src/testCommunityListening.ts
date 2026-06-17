import { LivingDonorsOnlineCrawler } from './services/crawler/LivingDonorsOnlineCrawler.js';

async function runDemo() {
    console.log('🔍 Starting LDO Community Listening Demo...');

    try {
        const crawler = new LivingDonorsOnlineCrawler();
        console.log('📡 Fetching a recent thread...');
        const articleData = await crawler.crawlRandomArticle();

        console.log('\n========================================');
        console.log(`📑 FOUND THREAD: ${articleData.title}`);
        console.log(`🔗 URL: ${articleData.url}`);
        console.log(`💬 POST EXCERPT: ${articleData.excerpt}`);
        console.log('========================================\n');

        console.log('🧠 Passing to AI Triage...');

        // Uncomment this once your communityListeningService function is hooked up!
        // const triageResult = await triageCommunityThread(articleData.title, articleData.content);
        // console.log('✅ TRIAGE RESULT:');
        // console.dir(triageResult, { depth: null, colors: true });

    } catch (error) {
        console.error('❌ Error during demo:', error);
    }
}

runDemo();