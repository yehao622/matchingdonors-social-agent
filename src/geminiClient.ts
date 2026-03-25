import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.warn("Warning: GEMINI_API_KEY is not set.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "" });

export async function callGemini(prompt: string): Promise<string> {
    const start = Date.now();

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }],
            config: {
                responseMimeType: "application/json",
            },
        });

        const text = response.text || "";
        const elapsed = Date.now() - start;
        console.log(`[Gemini] success in ${elapsed}ms, length=${text.length}`);
        return text;
    } catch (err) {
        const elapsed = Date.now() - start;
        console.error(`[Gemini] error after ${elapsed}ms`, err);
        throw err;
    }
}