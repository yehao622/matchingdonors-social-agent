import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function askGemini(prompt: string, maxRetries = 3): Promise<string> {
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
    const prompt = `
        You are the social media manager for MatchingDonors, a 501(c)(3) non-profit.
        Turn the following medical news into an engaging, empathetic 2-part social media thread.

        CRITICAL RULES:
        1. EACH individual post MUST be strictly LESS THAN 250 characters.
        2. Include relevant emojis and hashtags like #OrganDonation or #TransplantNews. Also, remember
        to add '#MatchingDonors Inc' with embedded link: 'https://matchingdonors.com/life'
        3. The last post must include a call to action with this link: ${url}
        
        Article Title: ${title}
        Article Summary: ${summary}

        OUTPUT STRICTLY AS A JSON ARRAY OF STRINGS. No markdown, no extra text.
    `;

    let text = await askGemini(prompt);
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    return JSON.parse(text);
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