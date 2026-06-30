import fs from 'fs/promises';
import path from 'path';
import { QueueItem } from '../types.js';

const QUEUE_FILE = path.resolve(process.cwd(), 'triage_queue.json');

export const QueueService = {
    /**
     * Loads the current triage queue from disk.
     * Returns an empty array if the file doesn't exist yet.
     */
    async loadQueue(): Promise<QueueItem[]> {
        try {
            const fileContent = await fs.readFile(QUEUE_FILE, 'utf-8');
            const rawQueue = JSON.parse(fileContent) as any[];

            // Normalize legacy data to perfectly match types.ts
            const normalizedQueue: QueueItem[] = rawQueue.map(item => {
                if (item.triage) {
                    // Upgrade draft_reply -> draftWarmReply
                    if (item.triage.draft_reply !== undefined) {
                        item.triage.draftWarmReply = item.triage.draft_reply;
                        delete item.triage.draft_reply;
                    }
                    // Upgrade primary_topic -> primaryTopic
                    if (item.triage.primary_topic !== undefined) {
                        item.triage.primaryTopic = item.triage.primary_topic;
                        delete item.triage.primary_topic;
                    }
                }
                return item as QueueItem;
            });

            return normalizedQueue;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            console.error('⚠️ Failed to load queue file:', error);
            return [];
        }
    },

    /**
     * Appends a new item to the queue and saves it to disk.
     */
    async saveToQueue(item: QueueItem): Promise<void> {
        try {
            const currentQueue = await this.loadQueue();
            currentQueue.push(item);
            await fs.writeFile(QUEUE_FILE, JSON.stringify(currentQueue, null, 2), 'utf-8');
        } catch (error) {
            console.error('⚠️ Failed to save item to queue:', error);
        }
    },

    /**
     * Overwrites the entire queue file with a new array of items.
     * Used by the review CLI to save the remaining items after approval/rejection.
     */
    async updateQueue(items: QueueItem[]): Promise<void> {
        try {
            await fs.writeFile(QUEUE_FILE, JSON.stringify(items, null, 2), 'utf-8');
        } catch (error) {
            console.error('⚠️ Failed to update queue file:', error);
        }
    }
};