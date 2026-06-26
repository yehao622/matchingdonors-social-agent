import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const QUEUE_FILE_PATH = path.resolve(process.cwd(), 'triage_queue.json');

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
    const TEMP_FILE = path.resolve(process.cwd(), '.clipboard_tmp.txt');

    try {
        await fs.writeFile(TEMP_FILE, text, 'utf-8');
        const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';

        // Tell the utility to read the file, and redirect output to /dev/null
        // so it immediately detaches from our Node process
        const command = isWayland
            ? `wl-copy < "${TEMP_FILE}" > /dev/null 2>&1`
            : `xclip -selection clipboard -in < "${TEMP_FILE}" > /dev/null 2>&1`;

        // Execute the command asynchronously
        await execAsync(command);
        console.log('📋 Draft reply copied to clipboard!');

        // Quietly clean up the temporary file
        await fs.unlink(TEMP_FILE).catch(() => { });
    } catch (error: any) {
        console.error(`⚠️ Clipboard error: Ensure xclip or wl-clipboard is installed.`, error.message);
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

    let queue: any[] = [];

    try {
        const fileContent = await fs.readFile(QUEUE_FILE_PATH, 'utf-8');
        queue = JSON.parse(fileContent);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log('✅ Queue file not found. Nothing to review!');
            rl.close();
            return;
        }
        console.error('⚠️ Error reading queue file:', error);
        rl.close();
        return;
    }

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
        console.log(`📌 AI TOPIC: ${item.triage?.primary_topic || 'N/A'}`);
        console.log(`\n🤖 AI DRAFT REPLY:\n"${item.triage?.draft_reply || 'No draft generated'}"`);
        console.log('==================================================\n');

        let validResponse = false;
        while (!validResponse) {
            const answer = await askQuestion('Action -> (a)pprove, (r)eject, (s)kip, or (q)uit: ');
            const choice = answer.trim().toLowerCase();

            if (choice === 'a') {
                console.log('✅ Approved!');
                // Trigger the Clipboard MVP automation
                await copyToClipboard(item.triage?.draft_reply || '');
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

    // Write the unprocessed/skipped items back to the queue
    await fs.writeFile(QUEUE_FILE_PATH, JSON.stringify(remainingQueue, null, 2), 'utf-8');

    // Optional: Save approved items to a separate file (e.g., ready_to_publish.json)
    if (approvedItems.length > 0) {
        const APPROVED_FILE_PATH = path.resolve(process.cwd(), 'ready_to_publish.json');
        let existingApproved: any[] = [];
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