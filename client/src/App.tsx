import { useState, useEffect } from 'react';
import { api } from './apiClient';

// Define our types based on the backend responses
interface Article {
  title: string;
  excerpt: string;
  url: string;
  sourceName: string;
}

// Hardcoded list of our available crawlers for the Grid UI
const CRAWLER_SOURCES = [
  { id: 'OptnCrawler', name: 'OPTN Gov Network' },
  { id: 'DailyTransplantCrawler', name: 'US Transplant News' },
  { id: 'IrishTransplantCrawler', name: 'Irish Transplant News' },
  { id: 'DailyDiabetesCrawler', name: 'Daily Diabetes' },
  { id: 'PubMedCrawler', name: 'PubMed Academic' },
  { id: 'PlosCrawler', name: 'PLOS Journals' }
];

export default function App() {
  const [article, setArticle] = useState<Article | null>(null);
  const [posts, setPosts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [globalStatus, setGlobalStatus] = useState('Initializing connection...');
  const [history, setHistory] = useState<any[]>([]);

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
      await api.publish(validPosts, article?.sourceName, article?.url);
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
      await api.publish(validPosts, article?.sourceName, article?.url);
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

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await api.getStatus();
        setIsRunning(data.isRunning);
        setGlobalStatus(data.status);
        const historyData = await api.getHistory();
        setHistory(historyData);
      } catch (error) {
        setGlobalStatus(`⚠️ Disconnected from Backend Server. ${error}`);
      }
    };

    // Fetch immediately, then every 5 seconds
    fetchStatus();
    const intervalId = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Engine Toggle Handlers
  const toggleEngine = async () => {
    try {
      if (isRunning) {
        await api.stopEngine();
        setIsRunning(false);
        setGlobalStatus('Idle (Engine Stopped)');
      } else {
        await api.startEngine();
        setIsRunning(true);
        setGlobalStatus('Starting up...');
      }
    } catch (error) {
      console.error('Failed to toggle engine', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Master Control Header */}
        <div className="bg-white rounded-[2rem] shadow-sm p-8 flex flex-col md:flex-row items-center justify-between border border-gray-100">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Social Agent <span className="text-blue-600">Core</span>
            </h1>
            <p className="text-gray-500 mt-2 font-medium">
              Autonomous AI News Pipeline
            </p>
          </div>

          <div className="mt-6 md:mt-0 flex items-center gap-6">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">System Status</p>
              <p className={`font-medium ${isRunning ? 'text-green-600 animate-pulse' : 'text-gray-500'}`}>
                {globalStatus}
              </p>
            </div>

            {/* The Giant Apple-Style Toggle Switch */}
            <button
              onClick={toggleEngine}
              className={`relative inline-flex h-14 w-28 items-center rounded-full transition-colors duration-300 focus:outline-none shadow-inner ${isRunning ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-10 w-10 transform rounded-full bg-white transition-transform duration-300 shadow-md ${isRunning ? 'translate-x-16' : 'translate-x-2'}`} />
            </button>
          </div>
        </div>

        {/* Phase 4: The Crawler Grid UI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CRAWLER_SOURCES.map((source) => {
            // Check if the backend is currently talking about THIS specific crawler
            const isActive = isRunning && globalStatus.includes(source.id);

            return (
              <div
                key={source.id}
                className={`relative bg-white rounded-3xl p-6 transition-all duration-500 border ${!isRunning ? 'opacity-60 grayscale border-gray-100 shadow-sm' :
                  isActive ? 'border-blue-500 shadow-lg scale-[1.02] ring-4 ring-blue-50' :
                    'border-gray-100 shadow-sm opacity-90'
                  }`}
              >
                {/* Active Indicator Pulse */}
                {isActive && (
                  <span className="absolute top-6 right-6 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}

                <h3 className="text-lg font-bold text-gray-900">{source.name}</h3>
                <p className="text-xs text-gray-400 font-mono mt-1 mb-6">{source.id}</p>

                <div className="bg-gray-50 rounded-xl p-4 min-h-[80px] flex items-center justify-center border border-gray-100/50">
                  <p className={`text-sm text-center font-medium ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                    {!isRunning ? 'Offline' : isActive ? 'Crawling & Generating Drafts...' : 'Waiting for next cycle...'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Phase B (Part 1): The History Log */}
      <div className="mt-12 bg-white rounded-[2rem] shadow-sm p-8 border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Publications Log</h2>

        {history.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            No articles have been published yet. Turn on the engine!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Timestamp</th>
                  <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Original URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {new Date(row.timestamp.replace(' ', 'T') + 'Z').toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-500">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {row.source_name}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-400 truncate max-w-md">
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">
                        {row.url}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}