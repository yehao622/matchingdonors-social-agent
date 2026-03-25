import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { BskyAgent, RichText } from '@atproto/api';
import * as readline from 'readline';

dotenv.config();

// 1. Initialize Clients
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const bskyAgent = new BskyAgent({ service: 'https://bsky.social' });

// Setup terminal input for HITL
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function runSocialAgent() {
    console.log('🤖 Starting MatchingDonors Bluesky Agent...');

    // 2. FETCH DATA (Dummy article for demo)
    const articleTitle = "New Breakthrough in Kidney Paired Donation Chains";
    const articleSummary = "A new hospital network has successfully completed a 12-person kidney paired donation chain, drastically reducing wait times for highly sensitized patients.";
    const articleUrl = "https://matchingdonors.com/life";

    console.log(`\n📰 Found Article: "${articleTitle}"`);
    console.log('🧠 Asking Gemini to draft a Bluesky Thread...\n');

    // 3. AI DRAFTING
    const prompt = `
        You are the social media manager for MatchingDonors, a 501(c)(3) non-profit.
        Turn the following medical news into an engaging, empathetic 2-part social media thread.

        CRITICAL RULES:
        1. EACH individual post MUST be strictly LESS THAN 280 characters.
        2. Include relevant emojis and hashtags like #OrganDonation or #TransplantNews. Also, remember
        to add '#MatchingDonors Inc' with embedded link: 'https://matchingdonors.com/life'
        3. The last post must include a call to action with this link: ${articleUrl}
        
        Article Title: ${articleTitle}
        Article Summary: ${articleSummary}

        OUTPUT STRICTLY AS A JSON ARRAY OF STRINGS. No markdown, no extra text.
        Example: [
            "Post 1 text here (under 280 chars)", 
            "Post 2 text here (under 280 chars)", 
            "Post 3 text here (under 280 chars)"
        ]
    `;

    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        let rawText = response.text || '[]';
        rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const posts: string[] = JSON.parse(rawText);

        // 4. HUMAN-IN-THE-LOOP (HITL) APPROVAL
        console.log('================ DRAFT THREAD ================');
        posts.forEach((post, index) => {
            console.log(`\n[Post ${index + 1} / ${posts.length}]:`);
            console.log(post);
        });
        console.log('\n==============================================');

        rl.question('\n👨‍💻 Do you approve this thread for publishing to Bluesky? (Y/N): ', async (answer) => {
            if (answer.toLowerCase() === 'y') {
                console.log('\n🚀 Authenticating and Publishing to Bluesky...');
                
                try {
                    // Login to Bluesky
                    await bskyAgent.login({
                        identifier: process.env.BLUESKY_HANDLE || '',
                        password: process.env.BLUESKY_PASSWORD || '',
                    });

                    // 5. POST TO BLUESKY (Handling the Thread)
                    let root: { uri: string, cid: string } | null = null;
                    let parent: { uri: string, cid: string } | null = null;

                    for (const text of posts) {
                        const rt = new RichText({ text });
                        await rt.detectFacets(bskyAgent); // Makes links clickable

                        const postRecord: any = {
                            $type: 'app.bsky.feed.post',
                            text: rt.text,
                            facets: rt.facets,
                            createdAt: new Date().toISOString(),
                        };

                        // If it's the second post, attach it to the first to create a thread
                        if (root && parent) {
                            postRecord.reply = { root, parent };
                        }

                        const res = await bskyAgent.post(postRecord);
                        
                        if (!root) root = { uri: res.uri, cid: res.cid };
                        parent = { uri: res.uri, cid: res.cid };
                    }

                    console.log('✅ Successfully published! Go check your Bluesky profile.');
                } catch (bskyError) {
                    console.error('❌ Failed to post to Bluesky:', bskyError);
                }
            } else {
                console.log('\n🛑 Draft rejected. Thread was not published.');
            }
            rl.close();
        });

    } catch (error) {
        console.error('Error generating draft:', error);
        rl.close();
    }
}

runSocialAgent();