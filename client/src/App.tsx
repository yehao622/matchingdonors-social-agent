import { useState } from 'react';

// Define our types based on the backend responses
interface Article {
  title: string;
  excerpt: string;
  url: string;
}

export default function App() {
  const [article, setArticle] = useState<Article | null>(null);
  const [posts, setPosts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');

  // Fetch random article & generate drafts
  const handleGenerate = async () => {
    setIsLoading(true);
    setStatus('Scraping latest article...');
    setPosts([]);

    try {
      // Scrape
      const scrapeRes = await fetch('http://localhost:3001/api/scrape');
      const scrapedData = await scrapeRes.json();
      setArticle(scrapedData);

      setStatus('Gemini is drafting posts...');

      // Draft
      const draftRes = await fetch('http://localhost:3001/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'INITIAL',
          title: scrapedData.title,
          excerpt: scrapedData.excerpt,
          url: scrapedData.url
        })
      });

      const draftData = await draftRes.json();
      setPosts(draftData.posts || []);
      setStatus('');
    } catch (error) {
      console.error(error);
      setStatus('Error generating content. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  // Publish to Bluesky
  const handlePublish = async () => {
    setIsLoading(true);
    setStatus('Publishing to Bluesky...');

    try {
      const res = await fetch('http://localhost:3001/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts })
      });

      if (res.ok) {
        setStatus('✅ Successfully published!');
        setPosts([]); // Clear posts on success
      } else {
        setStatus('❌ Failed to publish.');
      }
    } catch (error) {
      setStatus('❌ Error connecting to server.');
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel and clear everything
  const handleCancel = () => {
    setPosts([]);
    setArticle(null);
    setStatus('');
  };

  // Auto-Fix a specific long post
  const handleCondense = async (index: number) => {
    const originalPost = posts[index];

    // Pop up a native browser prompt for instructions (just like our CLI did!)
    const userNote = window.prompt(`Instructions for Gemini to fix Post ${index + 1} (leave blank for default):`);

    // If the user clicks "Cancel" on the prompt, do nothing
    if (userNote === null) return;

    const instruction = userNote.trim() || 'Make it more concise under 200 chars.';

    setIsLoading(true);
    setStatus(`Condensing Post ${index + 1}...`);

    try {
      const res = await fetch('http://localhost:3001/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONDENSE',
          originalPost: originalPost,
          instruction: instruction
        })
      });

      const data = await res.json();

      if (data.text) {
        const newPosts = [...posts];
        newPosts[index] = data.text;
        setPosts(newPosts);
        setStatus(`✅ Post ${index + 1} successfully condensed!`);
      } else {
        setStatus(`❌ Failed to condense Post ${index + 1}.`);
      }
    } catch (error) {
      console.error(error);
      setStatus('❌ Error connecting to server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">

      {/* The Apple-Style Main Card */}
      <div className="max-w-2xl w-full bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-10 transition-all">

        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Social Agent
          </h1>
          <p className="text-gray-500 mt-2">
            AI-powered medical news distribution.
          </p>
        </div>

        {/* Status Indicator */}
        {status && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium animate-pulse">
            {status}
          </div>
        )}

        {/* Content Section */}
        {posts.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-gray-400 mb-6">No drafts generated yet.</p>
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="px-8 py-3 bg-black hover:bg-gray-800 text-white rounded-full font-semibold transition-all disabled:opacity-50"
            >
              Fetch & Generate Draft
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Source Article</h3>
              <p className="font-medium text-gray-800">{article?.title}</p>
            </div>

            <div className="space-y-4">
              {posts.map((post, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <div className="relative">
                    <span className={`absolute top-4 right-4 text-xs font-bold px-2 py-1 rounded-full ${post.length > 300 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {post.length}/300
                    </span>
                    <textarea
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 pr-20 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                      rows={4}
                      value={post}
                      onChange={(e) => {
                        const newPosts = [...posts];
                        newPosts[index] = e.target.value;
                        setPosts(newPosts);
                      }}
                    />
                  </div>

                  {post.length > 300 && (
                    <button
                      onClick={() => handleCondense(index)}
                      disabled={isLoading}
                      className="self-end text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      ✨ Auto-Fix with Gemini
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-gray-100">
              <button
                onClick={handlePublish}
                disabled={isLoading || posts.some(p => p.length > 300)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Publish to Bluesky
              </button>

              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full font-semibold transition-all"
              >
                Regenerate
              </button>

              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="px-6 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-full font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}