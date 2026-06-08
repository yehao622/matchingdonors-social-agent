import { getArticleRelevanceScore, isRelevantArticle } from './services/articleRelevanceService.js';

const mockArticles = [
    {
        title: 'New diabetes treatment helps improve blood sugar control',
        excerpt: 'Researchers found better glucose outcomes in patients with type 2 diabetes.',
        url: 'https://example.com/diabetes-treatment'
    },
    {
        title: 'Living donor program helps kidney transplant patients',
        excerpt: 'A new transplant support model improves donor match outcomes.',
        url: 'https://example.com/kidney-donor-program'
    },
    {
        title: 'President Trump comments on election strategy',
        excerpt: 'Political reactions continue after the debate.',
        url: 'https://example.com/politics-news'
    },
    {
        title: 'NBA finals draw huge sports audience',
        excerpt: 'Basketball fans celebrate the championship win.',
        url: 'https://example.com/nba-finals'
    },
    {
        title: 'Heart health and nutrition tips for caregivers',
        excerpt: 'Simple treatment and nutrition guidance for chronic disease support.',
        url: 'https://example.com/heart-health-caregiver'
    },
    {
        title: 'Type 1 diabetes patients benefit from continuous glucose monitor upgrades',
        excerpt: 'New CGM devices may improve insulin timing and glucose tracking.',
        url: 'https://example.com/cgm-upgrades'
    },
    {
        title: 'Kidney transplant waitlist grows as living donor awareness remains low',
        excerpt: 'Experts say organ donation education could improve donor match outcomes.',
        url: 'https://example.com/kidney-waitlist'
    },
    {
        title: 'Obesity treatment study shows better A1C outcomes in prediabetes patients',
        excerpt: 'Clinical trial results suggest improved blood sugar markers over 12 months.',
        url: 'https://example.com/prediabetes-study'
    },
    {
        title: 'Celebrity shares favorite nutrition habits on summer tour',
        excerpt: 'Fans follow a music star’s diet and wellness routine.',
        url: 'https://example.com/celebrity-nutrition'
    },
    {
        title: 'Congress debates new healthcare budget proposal',
        excerpt: 'Political leaders discussed funding changes for public programs.',
        url: 'https://example.com/healthcare-budget'
    },
    {
        title: 'Dialysis patients face transportation barriers before transplant evaluation',
        excerpt: 'Caregiver burden and access issues continue to delay treatment.',
        url: 'https://example.com/dialysis-barriers'
    },
    {
        title: 'Researchers examine blood sugar patterns in older adults with chronic disease',
        excerpt: 'The study explores glucose variation, nutrition, and treatment adherence.',
        url: 'https://example.com/blood-sugar-study'
    },
    {
        title: 'Crypto market rebounds after volatile weekend trading',
        excerpt: 'Investors respond to new economic signals across global markets.',
        url: 'https://example.com/crypto-news'
    },
    {
        title: 'Soccer team doctor discusses injury recovery and patient rehab',
        excerpt: 'The interview focused on sports medicine and recovery planning.',
        url: 'https://example.com/soccer-rehab'
    },
    {
        title: 'Organ donor family shares story of hope after successful transplant',
        excerpt: 'The patient and caregiver community praised the life-saving donation.',
        url: 'https://example.com/donor-story'
    }
];

for (const article of mockArticles) {
    const score = getArticleRelevanceScore(article);
    const passed = isRelevantArticle(article);

    console.log('------------------------------');
    console.log(`Title: ${article.title}`);
    console.log(`Score: ${score}`);
    console.log(`Relevant: ${passed ? 'YES' : 'NO'}`);
}