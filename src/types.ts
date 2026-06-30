export interface ScrapedThread {
    title: string;
    url: string;
    content?: string;
}

export interface TriageResult {
    isRelevant: boolean;
    primaryTopic: string;
    userConcernSummary: string;
    sentiment: string;
    suggestedContentMatch: string;
    draftWarmReply: string | null; // Locked in camelCase!
}

export interface QueueItem {
    scrapedAt: string;
    thread: ScrapedThread;
    triage: TriageResult;
}