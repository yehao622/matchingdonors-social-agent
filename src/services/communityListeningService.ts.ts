export interface ThreadTriageResult {
    isRelevant: boolean;          // False if spam or unrelated
    primaryTopic: string;         // e.g., "Post-op Recovery", "Finding a Match", "Anxiety"
    userConcernSummary: string;   // 1-2 sentence summary of what the user needs
    sentiment: 'Distressed' | 'Inquiring' | 'Sharing' | 'Touching Story';
    suggestedContentMatch?: string; // What MatchingDonors content or news article would help?
    draftWarmReply?: string;      // ONLY generated if sentiment is "Touching Story" or "Inquiring"
}

// Example prompt template to pass to @google/genai
const TRIAGE_PROMPT = `
You are an empathetic community manager for an organ donation NGO. 
Analyze the following forum post from a living donor community.

Title: {title}
Content: {content}

Output JSON matching this exact schema:
{
  "isRelevant": boolean,
  "primaryTopic": string,
  "userConcernSummary": string,
  "sentiment": string (Distressed | Inquiring | Sharing | Touching Story),
  "suggestedContentMatch": string (A topic or specific type of guide/link we should provide),
  "draftWarmReply": string (Optional: Provide a concise, supportive 2-sentence reply. DO NOT give medical advice. ONLY populate if it's a touching story or a safe, general inquiry. Leave null otherwise.)
}
`;