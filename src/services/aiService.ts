import { GoogleGenAI } from '@google/genai';

let genAI: GoogleGenAI | null = null;

export async function askGemini(prompt: string, maxRetries = 3): Promise<string> {
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

export async function generateInitialDraft(
    title: string,
    summary: string,
    seoKeyword: string,
    performanceHint: string = "",
    isTwoPart?: boolean
): Promise<{ text: string, code: string }[]> {
    // Note: rawUrl is removed from arguments since Node handles it now.

    const prompt = `
        You are an expert social media manager for MatchingDonors, a 501(c)(3) non-profit. 
        Analyze the article context and automatically adopt the single best tone archetype. 
        Each archetype has a specific 6-character tracking CODE:
        - Patient Empathy (CODE: ai_patientStory): Touching personal story or patient-focused narrative.
        - Data Journalist (CODE: ai_Data): Heavy data, statistical updates, or numerical trends.
        - Expert Insight (CODE: ai_expertInsight): Clinical trial, research study, or medical breakthrough.
        - Myth Buster (CODE: ai_education): Debunking a health misconception or educational explainer.
        - Curiosity Gap (CODE: ai_general): General news where withholding a summary detail drives interest.

        Turn this medical news into an engaging 1-part or 2-part social media thread. DO NOT generate more than 2 posts.

        CRITICAL RULES:
        1. LENGTH: EACH post MUST be under 250 characters.
        2. HASHTAGS: Generate 1 or 2 highly specific, long-tail hashtags.
        3. NO LINKS: DO NOT INCLUDE ANY URLS. Focus ONLY on the engaging text. The system will append URLs automatically.
        4. SEO INJECTION: If the phrase "${seoKeyword}" fits naturally, weave it into the first post.
        ${isTwoPart ? `5. TWO-PART STRUCTURE: You MUST write exactly 2 posts. Post 1 covers the news angle from the article. 
            Post 2 must naturally bridge to MatchingDonors — e.g. mention that patients can find living donors, that matching is free,
            or that hope is available. Make the bridge feel like a genuine editorial follow-up, NOT an advertisement. Both posts must still be under 150 chars each.` :
            ''}
        ${performanceHint ? `${isTwoPart ? '6' : '5'}. ANALYTICS FEEDBACK: ${performanceHint}` : ''}
        
        Article Title: ${title}
        Article Summary: ${summary}

        OUTPUT FORMAT: Return ONLY a flat JSON array of objects. Example: 
        [
          {"text": "Your engaging post text here #hashtag", "code": "ai_patientStory"},
          {"text": "Second part of the thread here #hashtag2", "code": "ai_patientStory"}
        ]
        Do not write anything outside the JSON array block.
    `;

    let text = await askGemini(prompt);

    try {
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start === -1 || end === -1) throw new Error("Invalid array boundaries.");

        const jsonString = text.substring(start, end + 1);
        const parsed = JSON.parse(jsonString);

        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].text) {
            return parsed.map((item: any) => ({
                text: String(item.text).trim(),
                code: String(item.code || 'ai_general') // fallback code just in case
            }));
        }
        throw new Error("Invalid JSON structure.");
    } catch (error) {
        console.error("⚠️ Failed to parse Gemini response:", text);
        return [
            { text: `Medical News Update: ${title}`, code: 'ai_general' }
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