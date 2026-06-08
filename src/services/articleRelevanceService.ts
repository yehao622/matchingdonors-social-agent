type ArticleLike = {
    title?: string;
    excerpt?: string;
    url?: string;
};

const STRONG_POSITIVE_KEYWORDS = [
    'diabetes',
    'blood sugar',
    'glucose',
    'insulin',
    'a1c',
    'kidney donor',
    'living donor',
    'organ donor',
    'organ donation',
    'kidney transplant',
    'organ transplant',
    'dialysis',
    'transplant',
    'donor match',
];

const POSITIVE_KEYWORDS = [
    'prediabetes',
    'type 1 diabetes',
    'type 2 diabetes',
    'diabetic',
    'endocrinology',
    'cgm',
    'continuous glucose monitor',
    'health equity',
    'patient',
    'caregiver',
    'clinical trial',
    'treatment',
    'chronic disease',
    'nutrition',
    'obesity',
    'heart health',
    'medicare',
    'medicaid',
];

const NEGATIVE_KEYWORDS = [
    'trump',
    'election',
    'politics',
    'political',
    'senate',
    'congress',
    'shooting',
    'crime',
    'celebrity',
    'movie',
    'music',
    'sports',
    'nfl',
    'nba',
    'baseball',
    'soccer',
    'stock market',
    'crypto',
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

export function getArticleRelevanceScore(article: ArticleLike): number {
    const fullText = [
        article.title || '',
        article.excerpt || '',
        article.url || '',
    ]
        .join(' ')
        .toLowerCase();

    const strongPositiveHits = countMatches(fullText, STRONG_POSITIVE_KEYWORDS);
    const positiveHits = countMatches(fullText, POSITIVE_KEYWORDS);
    const negativeHits = countMatches(fullText, NEGATIVE_KEYWORDS);

    return strongPositiveHits * 3 + positiveHits - negativeHits * 4;
}

export function isRelevantArticle(article: ArticleLike): boolean {
    return getArticleRelevanceScore(article) >= 3;
}