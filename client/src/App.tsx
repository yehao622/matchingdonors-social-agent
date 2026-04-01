import { useState, useEffect } from 'react';
import { api } from './apiClient';

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
  const [timeLeft, setTimeLeft] = useState(30);
  const [isAutoMode, setIsAutoMode] = useState(false);

  // Fetch random article & generate drafts
  const handleGenerate = async () => {
    setIsLoading(true);
    setStatus('Scraping latest article...');
    setPosts([]);
    setIsAutoMode(false);

    try {
      // Scrape
      const scrapedData = await api.scrape();
      setArticle(scrapedData);

      setStatus('Gemini is drafting posts...');
      const draftData = await api.draft({
        action: 'INITIAL',
        title: scrapedData.title,
        excerpt: scrapedData.excerpt,
        url: scrapedData.url
      });

      setPosts(draftData.posts || []);
      setStatus('');

      setTimeLeft(30);
      setIsAutoMode(true);
    } catch (error) {
      console.error(error);
      setStatus('Error generating content. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!article) return;

    setIsLoading(true);
    setStatus('Gemini is drafting new posts...');
    setPosts([]);
    setIsAutoMode(false);

    try {
      const draftData = await api.draft({
        action: 'INITIAL',
        title: article.title,
        excerpt: article.excerpt,
        url: article.url
      });

      setPosts(draftData.posts || []);
      setStatus('✅ Fresh drafts generated!');

      setTimeLeft(30);
      setIsAutoMode(true);
    } catch (error) {
      console.error(error);
      setStatus('❌ Error regenerating content.');
    } finally {
      setIsLoading(false);
    }
  };

  // Publish to Bluesky
  const handlePublish = async () => {
    cancelAutoMode();

    // Filter out any empty posts (ignoring spaces)
    const validPosts = posts.filter(p => p.trim().length > 0);
    if (validPosts.length === 0) return;

    setIsLoading(true);
    setStatus('Publishing to Bluesky...');

    try {
      await api.publish(validPosts);
      setStatus('✅ Successfully published!');
      setPosts([]);
    } catch (error) {
      setStatus('❌ Error connecting to server: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel and clear everything
  const handleCancel = () => {
    cancelAutoMode();
    setPosts([]);
    setArticle(null);
    setStatus('');
  };

  // Auto-Fix a specific long post
  const handleCondense = async (index: number) => {
    cancelAutoMode();
    const originalPost = posts[index];

    // Pop up a native browser prompt for instructions (just like our CLI did!)
    const userNote = window.prompt(`Instructions for Gemini to fix Post ${index + 1} (leave blank for default):`);
    // If the user clicks "Cancel" on the prompt, do nothing
    if (userNote === null) return;

    const instruction = userNote.trim() || 'Make it more concise under 200 chars.';

    setIsLoading(true);
    setStatus(`Condensing Post ${index + 1}...`);

    try {
      const data = await api.draft({
        action: 'CONDENSE',
        originalPost: originalPost,
        instruction: instruction
      });

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

  const cancelAutoMode = () => {
    if (isAutoMode) {
      setIsAutoMode(false);
      setStatus('✋ Manual mode engaged. Auto-publish cancelled.');
    }
  };

  // The fully automated publish sequence (Runs when timer hits 0)
  const executeAutoPublish = async () => {
    setIsAutoMode(false);
    setIsLoading(true);
    const currentPosts = [...posts];

    // Auto-fix any long posts
    for (let i = 0; i < currentPosts.length; i++) {
      if (currentPosts[i].length > 300) {
        setStatus(`⚙️ Auto-publishing: Condensing Post ${i + 1}...`);
        try {
          const data = await api.draft({
            action: 'CONDENSE',
            originalPost: currentPosts[i],
            instruction: 'Make it more concise under 200 chars.'
          });

          if (data.text)
            currentPosts[i] = data.text;
        } catch (e) {
          console.error(e);
        }
      }
    }

    setPosts(currentPosts);

    // Filter empty posts and Publish
    const validPosts = currentPosts.filter(p => p.trim().length > 0);
    if (validPosts.length === 0) {
      setStatus('❌ Auto-publish aborted: No valid posts.');
      setIsLoading(false);
      return;
    }

    setStatus('🚀 Auto-publishing to Bluesky...');
    try {
      await api.publish(validPosts);
      setStatus('✅ Successfully auto-published!');
      setPosts([]);
    } catch (error) {
      setStatus(`❌ Error connecting to server. ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // The countdown timer hook
  useEffect(() => {
    if (!isAutoMode || isLoading) return;

    if (timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timerId);
    } else {
      executeAutoPublish();
    }
  }, [timeLeft, isAutoMode, isLoading, posts]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
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

        {/* Ghost Timer UI */}
        {isAutoMode && (
          <div className="mb-6 p-4 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-between shadow-sm animate-pulse">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full"></div>
              <p className="text-orange-800 font-medium">
                Auto-publishing in <span className="font-bold text-lg">{timeLeft}</span> seconds...
              </p>
            </div>
            <button
              onClick={cancelAutoMode}
              className="text-sm font-bold text-orange-600 hover:text-orange-800 bg-orange-100 hover:bg-orange-200 px-3 py-1 rounded-full transition-colors cursor-pointer"
            >
              Stop Timer
            </button>
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
                      onFocus={cancelAutoMode} // Stop timer if human types!
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
                      onClick={() => {
                        cancelAutoMode();
                        handleCondense(index);
                      }}
                      disabled={isLoading}
                      className="self-end text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      ✨ Auto-Fix with Gemini
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Another Post Button */}
            <div className="flex justify-center pt-2">
              <button
                onClick={() => {
                  cancelAutoMode();
                  setPosts([...posts, '']);
                }}
                className="px-5 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-full hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2"
              >
                ➕ Add another post to thread
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-gray-100">
              <button
                onClick={handlePublish}
                disabled={
                  isLoading ||
                  posts.filter(p => p.trim().length > 0).length === 0 ||
                  posts.some(p => p.length > 300)
                }
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Publish to Bluesky
              </button>

              <button
                onClick={handleRegenerate}
                disabled={
                  isLoading ||
                  !article
                }
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