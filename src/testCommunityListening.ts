import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { LivingDonorsOnlineCrawler } from './services/crawler/LivingDonorsOnlineCrawler.js';
import { triageCommunityThread } from './services/communityListeningService.js';

const HISTORY_FILE_PATH = path.resolve(process.cwd(), 'scraped_history.json');
const QUEUE_FILE_PATH = path.resolve(process.cwd(), 'triage_queue.json');

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function loadHistory(): Promise<Set<string>> {
    try {
        const fileContent = await fs.readFile(HISTORY_FILE_PATH, 'utf-8');
        const urls = JSON.parse(fileContent);
        return new Set(urls);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return new Set(); // Return empty set if file doesn't exist yet
        }
        throw error;
    }
}

async function saveHistory(history: Set<string>): Promise<void> {
    const urlArray = Array.from(history);
    await fs.writeFile(HISTORY_FILE_PATH, JSON.stringify(urlArray, null, 2), 'utf-8');
}

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
        // Load the history of seen URLs
        const seenUrls = await loadHistory();
        console.log(`📂 Loaded ${seenUrls.size} previously processed URLs from history.`);

        const crawler = new LivingDonorsOnlineCrawler();
        let foundNewThread = false;
        let attempts = 0;
        const maxAttempts = 15;

        while (!foundNewThread && attempts < maxAttempts) {
            attempts++;
            console.log(`\n📡 Fetching a recent thread (Attempt ${attempts}/${maxAttempts})...`);
            const articleData = await crawler.crawlRandomArticle();

            if (seenUrls.has(articleData.url)) {
                console.log(`⏭️ Already processed thread: "${articleData.title}".`);
                console.log('⏳ Retrying in 2 seconds to find a fresh thread...');
                await delay(2000); // Be polite to the forum server
                continue; // Skip the rest of the loop and start the next attempt
            }

            // If the code reaches here, we successfully found a new thread!
            foundNewThread = true;
            console.log(`📑 FOUND NEW THREAD: ${articleData.title}`);
            console.log('🧠 Passing to AI Triage...');

            const triageResult = await triageCommunityThread(articleData.title, articleData.content || '');

            console.log('✅ TRIAGE RESULT:');
            console.dir(triageResult, { depth: null, colors: true });

            await saveToQueue(articleData, triageResult);

            seenUrls.add(articleData.url);
            await saveHistory(seenUrls);
        }

        if (!foundNewThread) {
            console.log('\n🛑 Reached maximum retry attempts without finding a new thread. Try again later.');
        }
    } catch (error) {
        console.error('❌ Error during demo:', error);
    }
}

runDemo();