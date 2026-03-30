import axios from 'axios';

// Add any domains here that you DO NOT want to shorten
const EXCLUDED_DOMAINS = [
    'matchingdonors.com'
];

export async function shortenUrl(originalUrl: string): Promise<string> {
    try {
        const urlObj = new URL(originalUrl);

        // Check if the link's domain matches anything in our exception list
        const isExcluded = EXCLUDED_DOMAINS.some(domain =>
            urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
        );

        if (isExcluded) {
            return originalUrl;
        }

        // Call the free TinyURL API
        const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(originalUrl)}`);
        return response.data; // This returns the short string like "https://tinyurl.com/xyz"

    } catch (error) {
        console.error(`⚠️ Failed to shorten URL (${originalUrl}). Using original.`);
        return originalUrl; // If the API fails, safely fall back to the long URL
    }
}