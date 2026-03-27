import { AtpAgent, RichText } from '@atproto/api';
import dotenv from 'dotenv';

dotenv.config();

const bskyAgent = new AtpAgent({ service: 'https://bsky.social' });

export async function publishThreadToBluesky(posts: string[]): Promise<void> {
    await bskyAgent.login({
        identifier: process.env.BLUESKY_HANDLE || '',
        password: process.env.BLUESKY_PASSWORD || '',
    });

    let root: { uri: string, cid: string } | null = null;
    let parent: { uri: string, cid: string } | null = null;

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

        if (!root) root = { uri: res.uri, cid: res.cid };
        parent = { uri: res.uri, cid: res.cid };
    }
}