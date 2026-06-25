import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { exec, spawn } from 'child_process';

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
function copyToClipboard(text: string): Promise<void> {
    return new Promise((resolve) => {
        const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';
        const command = isWayland ? 'wl-copy' : 'xclip';
        const args = isWayland ? [] : ['-selection', 'clipboard'];

        // Spawn the native clipboard process
        const child = spawn(command, args);

        // Stream the text directly into the process, avoiding shell injection/parsing bugs
        child.stdin.write(text);
        child.stdin.end();

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`⚠️ Failed to copy to clipboard (Exit code: ${code}).`);
            } else {
                console.log('📋 Draft reply copied to clipboard!');
            }
            resolve();
        });

        child.on('error', (err) => {
            console.error(`⚠️ Missing clipboard utility. Ensure ${command} is installed.`, err.message);
            resolve();
        });
    });
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