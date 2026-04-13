import { AtpAgent, RichText } from '@atproto/api';

const bskyAgent = new AtpAgent({ service: 'https://bsky.social' });

let isAuthenticated = false;

export async function publishThreadToBluesky(posts: string[]): Promise<void> {
    // NEW: Only log in if we haven't already!
    if (!isAuthenticated) {
        await bskyAgent.login({
            identifier: process.env.BLUESKY_HANDLE || '', // Make sure this matches your .env
            password: process.env.BLUESKY_PASSWORD || '',
        });
        isAuthenticated = true;
        console.log('🔐 Authenticated with Bluesky.');
    }

    let root: { uri: string, cid: string } | null = null;
    let parent: { uri: string, cid: string } | null = null;
    let postedCount = 0;

    try {
        for (const text of posts) {
            const rt = new RichText({ text });
            await rt.detectFacets(bskyAgent);

            const postRecord: any = {
                $type: 'app.bsky.feed.post',
                text: rt.text,
                facets: rt.facets,
                createdAt: new Date().toISOString(),
            };

            if (root && parent) {
                postRecord.reply = { root, parent };
            }

            const res = await bskyAgent.post(postRecord);
            postedCount++;

            if (!root) root = { uri: res.uri, cid: res.cid };
            parent = { uri: res.uri, cid: res.cid };
        }
    } catch (error) {
        // If we posted at least one part, we MUST tell the system to treat it as a success 
        // to prevent duplicate spamming later.
        if (postedCount > 0) {
            console.error(`⚠️ Thread partially failed after ${postedCount} posts. Marking as crawled to prevent duplicates.`);
            return; // Exit without throwing, so the HistoryService still records the URL!
        }

        // If it failed before posting anything, throw the error so we can retry later
        throw error;
    }
}