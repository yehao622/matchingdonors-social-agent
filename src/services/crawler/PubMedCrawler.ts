import axios from 'axios';

export class PubMedCrawler {
    public async crawlRandomArticle() {
        // 1. Search for recent organ transplant articles and get JSON back
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="organ transplant"&retmode=json&retmax=10`;
        const searchRes = await axios.get(searchUrl);
        const ids = searchRes.data.esearchresult.idlist; // Array of PMIDs

        if (!ids || ids.length === 0) throw new Error('No PubMed articles found.');

        // Pick a random ID
        const randomId = ids[Math.floor(Math.random() * ids.length)];

        // 2. Fetch the summary for that specific ID
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${randomId}&retmode=json`;
        const summaryRes = await axios.get(summaryUrl);
        const articleData = summaryRes.data.result[randomId]; //

        return {
            title: articleData.title,
            excerpt: "Academic Journal abstract sourced from NCBI.", // PubMed summaries often omit full abstracts, so we provide a clean fallback
            url: `https://pubmed.ncbi.nlm.nih.gov/${randomId}/` //
        };
    }
}