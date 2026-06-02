import { AtpAgent, RichText } from '@atproto/api';

const bskyAgent = new AtpAgent({ service: 'https://bsky.social' });

let isAuthenticated = false;

// CronService constructs these; socialService merges them with auto-detected facets.
export interface BlueskyPost {
    text: string;
    linkFacets?: Array<{
        label: string;   // The exact label substring that appears in `text`
        uri: string;     // The full UTM URL to attach behind that label
    }>;
}

// Using TextEncoder ensures emoji or non-ASCII chars don't shift offsets.
function buildLinkFacet(fullText: string, label: string, uri: string): object | null {
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(fullText);
    const labelBytes = encoder.encode(label);

    // Find the byte offset of the label inside the full text
    const fullByteStr = Buffer.from(textBytes);
    const labelByteStr = Buffer.from(labelBytes);

    let byteStart = -1;
    for (let i = 0; i <= fullByteStr.length - labelByteStr.length; i++) {
        if (fullByteStr.slice(i, i + labelByteStr.length).equals(labelByteStr)) {
            byteStart = i;
            break;
        }
    }

    if (byteStart === -1) {
        console.warn(`⚠️ socialService: Could not find label "${label}" in post text. Skipping facet.`);
        return null;
    }

    return {
        index: {
            byteStart,
            byteEnd: byteStart + labelByteStr.length,
        },
        features: [
            {
                $type: 'app.bsky.richtext.facet#link',
                uri,
            },
        ],
    };
}

export async function publishThreadToBluesky(posts: BlueskyPost[]): Promise<void> {
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
        for (const postObj of posts) {
            const rt = new RichText({ text: postObj.text });
            await rt.detectFacets(bskyAgent);  // Auto-detect #hashtags and @mentions

            // Build manual link facets (e.g. "Read More" → full UTM URL)
            const manualFacets: object[] = [];
            if (postObj.linkFacets && postObj.linkFacets.length > 0) {
                for (const { label, uri } of postObj.linkFacets) {
                    const facet = buildLinkFacet(postObj.text, label, uri);
                    if (facet) manualFacets.push(facet);
                }
            }

            // Merge: auto-detected facets + our manual link facets
            const mergedFacets = [...(rt.facets || []), ...manualFacets];

            const postRecord: any = {
                $type: 'app.bsky.feed.post',
                text: rt.text,
                facets: mergedFacets.length > 0 ? mergedFacets : undefined,
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