import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { LivingDonorsOnlineCrawler } from './services/crawler/LivingDonorsOnlineCrawler.js';
import { triageCommunityThread } from './services/communityListeningService.js';

const QUEUE_FILE_PATH = path.resolve(process.cwd(), 'triage_queue.json');

async function saveToQueue(threadData: any, triageData: any) {
    let queue: any[] = [];

    // Try to read the existing file
    try {
        const fileContent = await fs.readFile(QUEUE_FILE_PATH, 'utf-8');
        queue = JSON.parse(fileContent);
    } catch (error: any) {
        // If file doesn't exist, we just start with an empty array
        if (error.code !== 'ENOENT') {
            console.error('⚠️ Error reading existing queue file:', error);
        }
    }

    // Append the new record with a timestamp
    const newRecord = {
        scrapedAt: new Date().toISOString(),
        thread: {
            title: threadData.title,
            url: threadData.url,
            content: threadData.content
        },
        triage: triageData
    };

    queue.push(newRecord);

    // Write it back to the file with nice formatting
    await fs.writeFile(QUEUE_FILE_PATH, JSON.stringify(queue, null, 2), 'utf-8');
    console.log(`💾 Successfully saved to ${QUEUE_FILE_PATH}`);
}

async function runDemo() {
    console.log('🔍 Starting LDO Community Listening Demo...');

    try {
        const crawler = new LivingDonorsOnlineCrawler();
        console.log('📡 Fetching a recent thread...');
        const articleData = await crawler.crawlRandomArticle();

        console.log(`📑 FOUND THREAD: ${articleData.title}`);
        console.log('🧠 Passing to AI Triage...');

        // Uncomment this once your communityListeningService function is hooked up!
        const triageResult = await triageCommunityThread(articleData.title, articleData.content || '');

        console.log('✅ TRIAGE RESULT:');
        console.dir(triageResult, { depth: null, colors: true });

        await saveToQueue(articleData, triageResult);
    } catch (error) {
        console.error('❌ Error during demo:', error);
    }
}

runDemo();