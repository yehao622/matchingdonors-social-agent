import { QueueService } from './services/QueueService.js';
import { QueueItem } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { exec, spawnSync } from 'child_process';

// Set up the readline interface for CLI interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to wrap readline in a Promise for clean async/await usage
const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

// Copies text to the system clipboard using native Linux utilities
async function copyToClipboard(text: string): Promise<void> {
    const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';
    const command = isWayland ? 'wl-copy' : 'xclip';
    const args = isWayland ? [] : ['-selection', 'clipboard'];

    try {
        const result = spawnSync(command, args, {
            input: text,
            encoding: 'utf-8',
            stdio: ['pipe', 'ignore', 'ignore']
        });

        if (result.error || result.status !== 0) {
            console.error(`\n⚠️ Clipboard tool missing! Please run: sudo apt install wl-clipboard xclip\n`);
        } else {
            console.log('📋 Draft reply copied to clipboard!');
        }
    } catch (error: any) {
        console.error(`\n⚠️ Clipboard error. Please run: sudo apt install wl-clipboard xclip\n`);
    }
}

// Opens a URL in the default system web browser
function openInBrowser(url: string) {
    exec(`xdg-open "${url}"`, (error) => {
        if (error) {
            console.error('⚠️ Failed to open URL automatically.');
        } else {
            console.log('🌐 Thread opened in default browser.');
        }
    });
}

async function reviewTriageQueue() {
    console.log('🔍 Loading Triage Queue for Human Review...\n');

    let queue: QueueItem[] = await QueueService.loadQueue();

    if (queue.length === 0) {
        console.log('✅ Queue is empty! You are all caught up.');
        rl.close();
        return;
    }

    const remainingQueue: any[] = [];
    const approvedItems: any[] = [];
    let reviewedCount = 0;

    for (const item of queue) {
        console.log('==================================================');
        console.log(`📑 SOURCE THREAD: ${item.thread.title}`);
        console.log(`🔗 URL: ${item.thread.url}`);
        console.log(`🎭 AI SENTIMENT: ${item.triage?.sentiment || 'N/A'}`);
        console.log(`📌 AI TOPIC: ${item.triage?.primaryTopic || 'N/A'}`);
        console.log(`\n🤖 AI DRAFT REPLY:\n"${item.triage?.draftWarmReply || 'No draft generated'}"`);
        console.log('==================================================\n');

        const draftText = item.triage?.draftWarmReply;
        const displayDraft = draftText ? draftText : 'No draft generated (Informational post)';

        let validResponse = false;
        while (!validResponse) {
            const answer = await askQuestion('Action -> (a)pprove, (r)eject, (s)kip, or (q)uit: ');
            const choice = answer.trim().toLowerCase();

            if (choice === 'a') {
                console.log('✅ Approved!');
                const textToCopy = draftText ? draftText : 'No AI draft needed. Write custom reply here.';
                await copyToClipboard(textToCopy);
                openInBrowser(item.thread.url);
                approvedItems.push(item);
                reviewedCount++;
                validResponse = true;
            } else if (choice === 'r') {
                console.log('❌ Rejected. Dropping from queue.');
                reviewedCount++;
                validResponse = true;
            } else if (choice === 's') {
                console.log('⏭️ Skipped. Keeping in queue for later.');
                remainingQueue.push(item);
                validResponse = true;
            } else if (choice === 'q') {
                console.log('🛑 Quitting review session early...');
                // Keep the current item and all remaining items in the queue
                remainingQueue.push(item, ...queue.slice(queue.indexOf(item) + 1));
                validResponse = true;
                break; // Breaks the while loop
            } else {
                console.log('⚠️ Invalid input. Please enter a, r, s, or q.');
            }
        }

        // Break the main for-loop if the user pressed 'q'
        if (remainingQueue.length + reviewedCount + approvedItems.length > queue.length) {
            break;
        }
        console.log('\n');
    }

    // USE THE SERVICE TO UPDATE (Properly scoped inside the function!)
    await QueueService.updateQueue(remainingQueue);

    // Optional: Save approved items to a separate file (e.g., ready_to_publish.json)
    if (approvedItems.length > 0) {
        const APPROVED_FILE_PATH = path.resolve(process.cwd(), 'ready_to_publish.json');
        let existingApproved: QueueItem[] = [];
        try {
            const approvedContent = await fs.readFile(APPROVED_FILE_PATH, 'utf-8');
            existingApproved = JSON.parse(approvedContent);
        } catch (e) { /* Ignore if it doesn't exist yet */ }

        const combinedApproved = [...existingApproved, ...approvedItems];
        await fs.writeFile(APPROVED_FILE_PATH, JSON.stringify(combinedApproved, null, 2), 'utf-8');
        console.log(`💾 Saved ${approvedItems.length} approved replies to ready_to_publish.json`);
    }

    console.log(`\n🎉 Session complete! Reviewed: ${reviewedCount}. Left in queue: ${remainingQueue.length}`);
    rl.close();
}

reviewTriageQueue();