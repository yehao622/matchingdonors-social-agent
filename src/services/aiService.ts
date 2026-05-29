import { GoogleGenAI } from '@google/genai';

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

export async function generateInitialDraft(title: string, summary: string, rawUrl: string, seoKeyword: string, performanceHint: string = ""): Promise<string[]> {

    const includeLink = Math.random() < 0.70;

    const prompt = `
        You are an expert social media manager for MatchingDonors, a 501(c)(3) non-profit. 
        Analyze the article context and automatically adopt the single best tone archetype:
        - 'patient_empathy': Use if it's a touching personal story or patient-focused narrative.
        - 'data_journalist': Use if it's heavy data, statistical updates, or numerical trends.
        - 'expert_insight': Use if it's a clinical trial, research study, or medical breakthrough.
        - 'myth_buster': Use if it's debunking a health misconception or an educational explainer.
        - 'curiosity_gap': Use for general news where withholding a summary detail drives interest.

        Turn this medical news into an engaging 1-part or 2-part social media thread.

        CRITICAL RULES:
        1. LENGTH: EACH individual post MUST be strictly LESS THAN 250 characters.
        2. HASHTAGS: DO NOT use generic hashtags like #OrganDonation or #DiabetesAwareness. Instead, generate 1 or 2 highly specific, long-tail hashtags based on the exact medical condition, drug name, or therapy mentioned in the text.
        ${includeLink ? `
        3. LINKS & UTMS: You must embed tracking parameters into your links using your selected archetype string (e.g., if you choose 'patient_empathy', use 'ai_agent_patient_empathy').
           - The final post in your thread MUST end with this specific article URL format: ${rawUrl}?utm_source=bluesky&utm_medium=social&utm_campaign=ai_agent_[SELECTED_ARCHETYPE]
           - If the thread has multiple parts, the first part MUST end with this general URL format: https://matchingdonors.com/life/?utm_source=bluesky&utm_medium=social&utm_campaign=ai_agent_[SELECTED_ARCHETYPE]_general
        ` : `
        3. LINKS: DO NOT INCLUDE ANY URLS OR LINKS IN THIS THREAD. This is a purely educational, native engagement post. End the final post with a thought-provoking question instead of a call-to-action link.
        `}
        4. SEO INJECTION: Evaluate if the target SEO phrase "${seoKeyword}" makes logical sense given the article's topic. If it fits naturally, weave it into the first post.
        ${performanceHint ? `5. ANALYTICS FEEDBACK: ${performanceHint}` : ''}
        
        Article Title: ${title}
        Article Summary: ${summary}

        OUTPUT FORMAT: You must return ONLY a flat JSON array of strings. Example: ["text 1", "text 2"]. Do not write anything outside the JSON array block.
    `;

    let text = await askGemini(prompt);

    try {
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start === -1 || end === -1) throw new Error("Invalid array boundaries.");

        const jsonString = text.substring(start, end + 1);
        const parsed = JSON.parse(jsonString);

        if (Array.isArray(parsed)) {
            return parsed.map(item => String(item));
        } else if (parsed && typeof parsed === 'object' && parsed.posts) {
            return Array.isArray(parsed.posts) ? parsed.posts.map(String) : [String(parsed.posts)];
        }
        throw new Error("Invalid JSON structure.");
    } catch (error) {
        console.error("⚠️ Failed to parse Gemini response:", text);
        return includeLink
            ? [`Medical News Update: ${title}\n\nRead more: ${rawUrl}?utm_source=bluesky&utm_medium=social&utm_campaign=ai_agent_fallback`]
            : [`Interesting medical insights regarding ${title}. What are your thoughts on this development?`];
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