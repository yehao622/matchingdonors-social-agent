import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';
import { AtpAgent, RichText } from '@atproto/api';
import * as readline from 'readline';
import { select, input } from '@inquirer/prompts';

import { DailyTransplantCrawler } from './crawler.js';

//  Initialize Clients
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const bskyAgent = new AtpAgent({ service: 'https://bsky.social' });

// Setup terminal input for HITL
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function runSocialAgent() {
    console.log('🤖 Starting MatchingDonors Bluesky Agent...');


    // Fetch data via crawler
    console.log('Crawling dailytransplantnews.com for the latest article...');
    const crawler = new DailyTransplantCrawler();

    // Grab the links from the homepage
    const links = await crawler.crawlIndex();

    if (links.length === 0) {
        console.error('❌ No articles found. Exiting.');
        process.exit(1);
    }

    // We take the first link (usually the most recent post)
    const latestArticleUrl = links[0];
    if (!latestArticleUrl) {
        console.error('❌ No articles found or URL is invalid. Exiting.');
        process.exit(1);
    }
    console.log(`🔗 Found latest article URL: ${latestArticleUrl}`);

    // Scrape the actual article content
    const articleData = await crawler.crawlArticle(latestArticleUrl);

    const articleTitle = articleData.title;
    const articleSummary = articleData.excerpt;
    const articleUrl = articleData.url;

    console.log(`\n📰 Successfully scraped: "${articleTitle}"`);
    console.log('🧠 Asking Gemini to draft a Bluesky Thread...\n');

    // AI DRAFTING (Your exact prompt, now using dynamic variables)
    const prompt = `
            You are the social media manager for MatchingDonors, a 501(c)(3) non-profit.
            Turn the following medical news into an engaging, empathetic 2-part social media thread.

            CRITICAL RULES:
            1. EACH individual post MUST be strictly LESS THAN 280 characters.
            2. Include relevant emojis and hashtags like #OrganDonation or #TransplantNews. Also, remember
            to add '#MatchingDonors' with embedded link: 'https://matchingdonors.com/life'
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

    const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    let rawText = response.text || '[]';
    rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const posts: string[] = JSON.parse(rawText);

    // HUMAN-IN-THE-LOOP (HITL) APPROVAL
    const askQuestion = (query: string): Promise<string> => {
        return new Promise(resolve => rl.question(query, resolve));
    };

    // Terminal color codes
    const RED = '\x1b[31m';
    const GREEN = '\x1b[32m';
    const RESET = '\x1b[0m';
    const YELLOW = '\x1b[33m';

    //  HUMAN-IN-THE-LOOP (HITL) INTERACTIVE LOOP
    let isApproved = false;

    while (!isApproved) {
        console.log('\n================ DRAFT THREAD ================');
        let allValid = true;

        posts.forEach((post, index) => {
            const count = post.length;
            const color = count > 300 ? RED : GREEN;
            const warning = count > 300 ? ' ⚠️ TOO LONG!' : ' ✅ OK';
            if (count > 300) allValid = false;

            console.log(`\n${color}[Post ${index + 1} / ${posts.length}] - ${count}/300 chars${warning}${RESET}`);
            console.log(post);
        });
        console.log('\n==============================================\n');

        // Build dynamic choices for the fancy menu
        const choices = [
            {
                name: allValid ? '🚀 Proceed & Publish to Bluesky' : '🔧 Auto-Fix Long Posts with Gemini',
                value: 'PROCEED',
                description: allValid ? 'Everything looks good! Ship it.' : 'Let Gemini automatically condense the long posts.'
            }
        ];

        // Add an "Edit" option for each individual post
        posts.forEach((_, index) => {
            choices.push({
                name: `✏️  Manually Edit Post ${index + 1}`,
                value: `EDIT_${index}`,
                description: 'Type your own custom text for this specific post.'
            });
        });

        choices.push({
            name: '🛑 Cancel & Exit',
            value: 'CANCEL',
            description: 'Throw away this draft and exit.'
        });

        // The Fancy Arrow-Key Menu
        const choice = await select({
            message: 'What would you like to do?',
            choices: choices,
        });

        if (choice === 'CANCEL') {
            console.log('\n🛑 Draft rejected. Exiting agent.');
            process.exit(0);
        }

        else if (choice === 'PROCEED') {
            if (allValid) {
                isApproved = true; // Breaks the loop
            } else {
                const invalidIndex = posts.findIndex(p => p.length > 300);

                // Fancy text input
                const userNoteInput = await input({
                    message: `${YELLOW}Instructions for Gemini to fix Post ${invalidIndex + 1} (or press Enter for default):${RESET}`
                });

                const userNote = userNoteInput.trim() === ''
                    ? 'Based on this post make it more concise with 200 characters'
                    : userNoteInput.trim();

                console.log('\n🧠 Asking Gemini to condense the post...');
                const fixPrompt = `
                        You are a social media manager. Your previous draft was too long (over 300 characters).
                        Rewrite this specific post to be STRICTLY UNDER 280 characters.
                        
                        User Instructions for this rewrite: "${userNote}"
                        
                        Original Post: "${posts[invalidIndex]}"
                        
                        OUTPUT ONLY THE NEW TEXT STRING. No markdown, no quotes, no extra text.
                    `;

                try {
                    const fixResponse = await genAI.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: fixPrompt,
                    });

                    if (fixResponse.text) {
                        posts[invalidIndex] = fixResponse.text.trim();
                        console.log(`✅ Post ${invalidIndex + 1} updated by Gemini!`);
                    } else {
                        console.log(`⚠️ Gemini returned an empty response. Post ${invalidIndex + 1} was not updated.`);
                    }
                } catch (err) {
                    console.error('❌ Failed to get rewrite from Gemini:', err);
                }
            }
        }

        else if (choice.startsWith('EDIT_')) {
            const postIndex = parseInt(choice.split('_')[1]);

            console.log(`\n✏️  Current text:\n${posts[postIndex]}`);

            // Fancy text input for manual editing
            const newText = await input({
                message: `Enter new text for Post ${postIndex + 1} (leave empty to cancel):`
            });

            if (newText.trim().length > 0) {
                posts[postIndex] = newText.trim();
            }
        }
    }

    // POST TO BLUESKY 
    // (This code only runs if they typed 'P' and allValid was true)
    console.log('\n🚀 Authenticating and Publishing to Bluesky...');
    try {
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

        console.log(`\n${GREEN}✅ Successfully published! Go check your Bluesky profile.${RESET}`);
    } catch (bskyError) {
        console.error('❌ Failed to post to Bluesky:', bskyError);
    } finally {
        rl.close();
    }

}
runSocialAgent();