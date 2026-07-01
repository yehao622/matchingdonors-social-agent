import { banditService } from './services/BanditService.js';
import fs from 'fs';
import path from 'path';

async function runTest() {
    console.log('🚀 Initializing Bandit Loop Test...');
    await banditService.init();

    const testArticleUrl = 'https://dailydiabetesnews.com/blood-sugar-spikes-in-23-year-old-despite-eating-clean-why-his-boba-tea-addiction-pushed-up-levels-health-and-wellness-news';
    const queueFilePath = path.join(process.cwd(), 'triage_queue.json');

    // 1. Simulate logging a pending decision (e.g., when a post is broadcasted)
    console.log('\n📝 Step 1: Logging a pending bandit decision...');
    await banditService.logPendingDecision({
        articleUrl: testArticleUrl,
        contextBucket: 'high',
        actionKey: 'thread_linked',
        publishedAt: new Date().toISOString()
    });

    // 2. Mock an active triage queue file reflecting a positive community signal
    console.log('\n📦 Step 2: Creating a mock triage_queue.json event...');
    const mockTriageQueue = [
        {
            thread: {
                url: `https://livingdonorsonline.org/ldosmf/index.php?topic=1032&url=${testArticleUrl}`
            },
            triage: {
                sentiment: 'Neutral', // This matches our positive condition
                draftWarmReply: 'This looks like a great resource!'
            }
        }
    ];
    fs.writeFileSync(queueFilePath, JSON.stringify(mockTriageQueue, null, 2), 'utf-8');

    // 3. Force the Bandit to resolve its rewards immediately
    console.log('\n⚙️ Step 3: Triggering reward resolution loop...');

    // Temporarily bypass the rewardMaturityHours configuration for testing
    // by manually invoking the lookup logic on our test row
    const pendingRows = [
        {
            article_url: testArticleUrl,
            context_bucket: 'high',
            action_key: 'thread_linked' as const,
            reward_status: 'pending' as const,
            reward: null,
            published_at: new Date().toISOString(),
            resolved_at: null
        }
    ];

    console.log('🔍 Running computeRewardForPendingRow on mock data...');
    // @ts-ignore - reaching into private method for test isolation
    const calculatedReward = await banditService.computeRewardForPendingRow(pendingRows[0]);

    console.log(`\n📊 Test Result: Calculated Reward = ${calculatedReward}`);
    if (calculatedReward === 1) {
        console.log('✅ SUCCESS: The Bandit accurately read the triage queue and extracted a positive reward signal!');
    } else {
        console.log('❌ FAILURE: Reward was not successfully processed.');
    }

    // Clean up our test structures
    if (fs.existsSync(queueFilePath)) fs.unlinkSync(queueFilePath);
    await banditService.close();
}

runTest().catch(console.error);