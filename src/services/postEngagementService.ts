type ArticleLike = {
    title?: string;
    excerpt?: string;
    url?: string;
};

const CURIOSITY_KEYWORDS = [
    'why',
    'how',
    'warning',
    'risk',
    'surprising',
    'hidden',
    'mistake',
    'myth',
    'truth',
    'spike',
    'drop',
    'prevent',
    'signs',
];

const EMOTION_KEYWORDS = [
    'patient',
    'family',
    'caregiver',
    'fear',
    'hope',
    'struggle',
    'saved',
    'complications',
    'diagnosed',
    'misdiagnosed',
];

const ACTION_KEYWORDS = [
    'reduce',
    'improve',
    'protect',
    'avoid',
    'manage',
    'control',
    'help',
    'reviewed',
    'best',
    'guide',
    'tips',
];

const LOW_ENGAGEMENT_KEYWORDS = [
    'conference',
    'conference report',
    'editorial',
    'policy update',
    'market',
    'funding round',
    'corporate',
    'earnings',
];

function countMatches(text: string, keywords: string[]): number {
    let score = 0;
    for (const keyword of keywords) {
        if (text.includes(keyword)) {
            score++;
        }
    }
    return score;
}

export function getArticleEngagementScore(article: ArticleLike): number {
    const fullText = [
        article.title || '',
        article.excerpt || '',
        article.url || '',
    ]
        .join(' ')
        .toLowerCase();

    const curiosityHits = countMatches(fullText, CURIOSITY_KEYWORDS);
    const emotionHits = countMatches(fullText, EMOTION_KEYWORDS);
    const actionHits = countMatches(fullText, ACTION_KEYWORDS);
    const lowEngagementHits = countMatches(fullText, LOW_ENGAGEMENT_KEYWORDS);

    return curiosityHits * 2 + emotionHits * 2 + actionHits * 1 - lowEngagementHits * 2;
}

export function isHighEngagementCandidate(article: ArticleLike): boolean {
    return getArticleEngagementScore(article) >= 3;
}