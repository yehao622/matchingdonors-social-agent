import { askGemini } from './aiService.js';

export interface ThreadTriageResult {
    isRelevant: boolean;
    primaryTopic: string;
    userConcernSummary: string;
    sentiment: 'Distressed' | 'Inquiring' | 'Sharing' | 'Touching Story' | 'Administrative' | 'Other';
    suggestedContentMatch?: string;
    draftWarmReply?: string | null;
}

export async function triageCommunityThread(title: string, content: string): Promise<ThreadTriageResult> {
    const prompt = `
You are an empathetic, analytical community manager for an organ donation NGO. 
Analyze the following forum post from a living donor community.

Title: ${title}
Content: ${content}

Determine if this is a genuine user post about living donation/transplants, or just an administrative/unrelated post. 
If it's an administrative post, mark "isRelevant" as false.

Output ONLY a raw JSON object matching this exact schema (no markdown formatting, no backticks):
{
  "isRelevant": boolean,
  "primaryTopic": string,
  "userConcernSummary": string,
  "sentiment": string (must be exactly one of: "Distressed", "Inquiring", "Sharing", "Touching Story", "Administrative", "Other"),
  "suggestedContentMatch": string (A topic or type of guide we should provide. Null if irrelevant.),
  "draftWarmReply": string (Optional: Provide a concise, supportive 2-sentence reply. DO NOT give medical advice. ONLY populate if it's a touching story or a safe, general inquiry. Leave null otherwise.)
}
`;

    try {
        // Use the newly exported askGemini function
        const aiResponse = await askGemini(prompt);

        // Clean up the response in case the AI added markdown backticks (e.g., \`\`\`json)
        const cleanJsonString = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        const result: ThreadTriageResult = JSON.parse(cleanJsonString);
        return result;
    } catch (error) {
        console.error('Error parsing AI triage response:', error);
        throw new Error('Failed to triage thread via AI.');
    }
}