import { GoogleGenAI } from '@google/genai';
import { shortenUrl } from './urlService.js'

let genAI: GoogleGenAI | null = null;

async function askGemini(prompt: string, maxRetries = 3): Promise<string> {
    // LAZY INITIALIZATION: Create the client right before we need it.
    if (!genAI) {
        genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    }

    let delayMs = 5000; // Start with a 5-second wait
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.5-flash-lite',
                contents: prompt,
            });
            return response.text || '';
        } catch (error: any) {
            const isOverloaded = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('high demand');

            if (isOverloaded && attempt < maxRetries) {
                console.warn(`⚠️ Gemini API Overloaded (503). Retrying in ${delayMs / 1000}s... (Attempt ${attempt} of ${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                delayMs *= 2; // Double the wait time for the next attempt (5s -> 10s -> 20s)
            } else {
                // If it's a different error (like a bad API key), or we ran out of retries, throw it to the main Cron loop.
                throw error;
            }
        }
    }

    return '';
}

export async function generateInitialDraft(title: string, summary: string, url: string): Promise<string[]> {
    const generalTrackingUrl = "https://matchingdonors.com/life/?utm_source=bluesky&utm_medium=social&utm_campaign=ai_agent_thread";
    const shortGeneralUrl = await shortenUrl(generalTrackingUrl);

    const prompt = `
        You are the social media manager for MatchingDonors, a 501(c)(3) non-profit.
        Turn the following medical news into an engaging, empathetic 2-part social media thread.

        CRITICAL RULES:
        1. EACH individual post MUST be strictly LESS THAN 250 characters.
        2. TONE & TAGS: Be highly empathetic. Include hashtags like #OrganDonation and #MatchingDonors.
        3. GENERAL CTA: Every post in the thread EXCEPT the last one MUST end with this exact raw URL: ${shortGeneralUrl}
        4. The last post must include a call to action with this link: ${url}
        
        Article Title: ${title}
        Article Summary: ${summary}

        OUTPUT STRICTLY AS A JSON ARRAY OF STRINGS. No markdown, no extra text.
    `;

    let text = await askGemini(prompt);

    try {
        // Find the first '[' and the last ']'
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');

        if (start === -1 || end === -1) {
            throw new Error("Gemini did not return a valid array.");
        }

        const jsonString = text.substring(start, end + 1);
        return JSON.parse(jsonString);

    } catch (error) {
        console.error("⚠️ Failed to parse Gemini response:", text);
        // Fallback to avoid crashing the bot: return a safe default
        return [
            `Medical News Update: ${title} #OrganDonation #TransplantNews\n\nRead more: ${url}`
        ];
    }
}

export async function condensePost(originalPost: string, userNote: string): Promise<string | null> {
    const prompt = `
        You are a social media manager. Your previous draft was too long (over 300 characters).
        Rewrite this specific post to be STRICTLY UNDER 280 characters.
        
        User Instructions for this rewrite: "${userNote}"
        Original Post: "${originalPost}"
        
        OUTPUT ONLY THE NEW TEXT STRING. No markdown, no quotes, no extra text.
    `;

    const text = await askGemini(prompt);
    return text.trim() || null;
}