import { select, input } from '@inquirer/prompts';
import { DailyTransplantCrawler } from './services/crawlerService.js';
import { generateInitialDraft, condensePost } from './services/aiService.js';
import { publishThreadToBluesky } from './services/socialService.js';
import { shortenUrl } from './services/urlService.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';

async function runSocialAgent() {
    console.log('🤖 Starting MatchingDonors Social Media Engine...\n');

    try {
        // 1. DATA FETCHING
        console.log('🕷️ Crawling for the latest article...');
        const crawler = new DailyTransplantCrawler();
        const links = await crawler.crawlIndex();
        if (links.length === 0) throw new Error('No articles found.');

        //  Pick a random index between 0 and the total number of links
        const randomIndex = Math.floor(Math.random() * links.length);
        const randomArticleUrl = links[randomIndex];

        if (!randomArticleUrl) {
            throw new Error('Failed to select a random article.');
        }

        const articleData = await crawler.crawlArticle(randomArticleUrl);
        console.log(`📰 Scraped: "${articleData.title}"`);

        // Shorten the URL before passing it to the AI!
        console.log('🔗 Shortening article URL...');
        const finalUrl = await shortenUrl(articleData.url);

        // 2. AI DRAFTING
        console.log('🧠 Generating initial drafts...');
        const posts = await generateInitialDraft(articleData.title, articleData.excerpt, finalUrl);

        // 3. UI/CLI LOOP
        let isApproved = false;

        while (!isApproved) {
            console.log('\n================ DRAFT THREAD ================');
            let allValid = true;

            posts.forEach((post, index) => {
                const count = post.length;
                const color = count > 300 ? RED : GREEN;
                if (count > 300) allValid = false;
                console.log(`\n${color}[Post ${index + 1}] - ${count}/300 chars${RESET}`);
                console.log(post);
            });
            console.log('\n==============================================\n');

            const choices = [
                { name: allValid ? '🚀 Publish to Bluesky' : '🔧 Auto-Fix with Gemini', value: 'PROCEED' },
                { name: '🔄 Regenerate Entire Thread', value: 'REGENERATE' },
                ...posts.map((_, i) => ({ name: `✏️ Edit Post ${i + 1}`, value: `EDIT_${i}` })),
                { name: '🛑 Cancel', value: 'CANCEL' }
            ];

            const choice = await select({ message: 'What would you like to do?', choices });

            if (choice === 'CANCEL') {
                console.log('🛑 Cancelled.');
                process.exit(0);
            } else if (choice === 'PROCEED') {
                if (allValid) {
                    isApproved = true;
                } else {
                    const invalidIndex = posts.findIndex(p => p.length > 300);
                    const originalPost = posts[invalidIndex];

                    if (originalPost) {
                        const userNote = await input({ message: `${YELLOW}Instructions for Gemini (or press Enter):${RESET}` });
                        const instruction = userNote.trim() || 'Make it more concise under 200 chars.';

                        // TypeScript is happy because originalPost is definitely a string now
                        const newText = await condensePost(originalPost, instruction);
                        if (newText) posts[invalidIndex] = newText;
                    }
                }
            } else if (choice === 'REGENERATE') {
                console.log('\n🧠 Asking Gemini for a completely new draft...');

                try {
                    // Fetch a fresh set of posts using the exact same article data
                    const newDrafts = await generateInitialDraft(articleData.title, articleData.excerpt, finalUrl);

                    // Replace the current posts array with the new drafts
                    posts.length = 0;
                    posts.push(...newDrafts);

                    console.log(`\n${GREEN}✨ Fresh drafts generated successfully!${RESET}`);
                } catch (error) {
                    console.error('❌ Failed to regenerate drafts:', error);
                }
            } else if (choice.startsWith('EDIT_')) {
                const splitArray = choice.split('_');
                const idxStr = splitArray[1];

                if (idxStr) {
                    // TypeScript is happy because idxStr is definitely a string
                    const idx = parseInt(idxStr);
                    const newText = await input({ message: `New text for Post ${idx + 1}:` });
                    if (newText.trim()) posts[idx] = newText.trim();
                }
            }
        }

        // 4. PUBLISHING
        console.log('\n🚀 Publishing to Bluesky...');
        await publishThreadToBluesky(posts);
        console.log(`\n${GREEN}✅ Successfully published!${RESET}`);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

runSocialAgent();