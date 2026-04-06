import { useState, useEffect } from 'react';
import { api } from './apiClient';

const CRAWLER_SOURCES = [
  { id: 'OptnCrawler', name: 'OPTN Gov Network' },
  { id: 'DailyTransplantCrawler', name: 'US Transplant News' },
  { id: 'IrishTransplantCrawler', name: 'Irish Transplant News' },
  { id: 'DailyDiabetesCrawler', name: 'Daily Diabetes' },
  { id: 'PubMedCrawler', name: 'PubMed Academic' },
  { id: 'PlosCrawler', name: 'PLOS Journals' }
];

interface Article {
  title: string;
  excerpt: string;
  url: string;
  sourceName: string;
}

interface HistoryItem {
  timestamp: string;
  source_name: string;
  url: string;
}

interface DraftData {
  article: Article;
  posts: string[];
}

export default function App() {
  // --- DASHBOARD STATE ---
  const [isRunning, setIsRunning] = useState(false);
  const [globalStatus, setGlobalStatus] = useState('Initializing connection...');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // --- DRAFT STUDIO STATE ---
  const [isDrafting, setIsDrafting] = useState(false);
  const [activeCrawler, setActiveCrawler] = useState<string | null>(null);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [editedDraft, setEditedDraft] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  // ==========================================
  // 1. ENGINE & HISTORY POLLING
  // ==========================================
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

    fetchStatus();
    const intervalId = setInterval(fetchStatus, 1000);
    return () => clearInterval(intervalId);
  }, []);

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

  // ==========================================
  // 2. DRAFT STUDIO CONTROLS
  // ==========================================
  const handleTakeControl = async (crawlerId: string) => {
    // Instantly pause the background engine!
    if (isRunning) {
      await api.stopEngine();
      setIsRunning(false);
      setGlobalStatus('⚙️ Manual Override Engaged (Engine Paused)');
    }

    setIsDrafting(true);
    setActiveCrawler(crawlerId);
    setDraftData(null);
    setTimeLeft(30);
    setIsTimerPaused(false);

    try {
      const data = await api.getStudioDraft(crawlerId);
      setDraftData(data);
      setEditedDraft(data.posts.join('\n\n'));
    } catch (error) {
      alert(`Failed to generate draft. Check backend console.: ${error}`);
      setIsDrafting(false);
    }
  };

  const handlePublish = async () => {
    if (!draftData) return;

    setIsTimerPaused(true);
    try {
      // Convert the text box back into an array for the backend
      const postsArray = editedDraft.split('\n\n').filter(p => p.trim() !== '');
      if (postsArray.length === 0) return alert('Cannot publish empty posts!');

      await api.publishPost(postsArray, activeCrawler || 'Manual', draftData.article.url);
      setIsDrafting(false); // Close modal on success
    } catch (error) {
      alert(`Failed to publish with error ${error}`);
    }
  };

  // The Draft Studio Ghost Timer
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;

    // Only count down if modal is open, data exists, not paused, and time > 0
    if (isDrafting && draftData && !isTimerPaused) {
      if (timeLeft > 0) {
        timerId = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      } else if (timeLeft === 0) {
        // Wrap handlePublish in a setTimeout to push it to the next tick, satisfying the linter!
        timerId = setTimeout(() => handlePublish(), 0);
      }
    }

    return () => clearTimeout(timerId);
  }, [timeLeft, draftData, isTimerPaused, isDrafting]);


  // ==========================================
  // 3. UI RENDER
  // ==========================================
  return (
    <div className="min-h-screen bg-[#f9fafb] p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="bg-white rounded-[2rem] shadow-sm p-8 flex flex-col md:flex-row items-center justify-between border border-gray-100">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Social Agent <span className="text-blue-600">Core</span>
            </h1>
            <p className="text-gray-500 mt-2 font-medium">Autonomous AI News Pipeline</p>
          </div>
          <div className="mt-6 md:mt-0 flex items-center gap-6">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">System Status</p>
              <p className={`font-medium ${!isRunning ? 'text-gray-500' :
                (globalStatus.includes('⏳') || globalStatus.includes('✅')) ? 'text-amber-500 animate-pulse font-bold' :
                  'text-green-600 animate-pulse'
                }`}>
                {globalStatus}
              </p>
            </div>
            <button
              onClick={toggleEngine}
              className={`relative inline-flex h-14 w-28 items-center rounded-full transition-colors duration-300 focus:outline-none shadow-inner ${isRunning ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-10 w-10 transform rounded-full bg-white transition-transform duration-300 shadow-md ${isRunning ? 'translate-x-16' : 'translate-x-2'}`} />
            </button>
          </div>
        </div>

        {/* Crawler Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CRAWLER_SOURCES.map((source) => {
            const isActive = isRunning && globalStatus.includes(source.id);
            return (
              <div
                key={source.id}
                className={`relative bg-white rounded-3xl p-6 transition-all duration-500 border ${!isRunning ? 'opacity-60 grayscale border-gray-100 shadow-sm' :
                  isActive ? 'border-blue-500 shadow-lg scale-[1.02] ring-4 ring-blue-50' :
                    'border-gray-100 shadow-sm opacity-90'
                  }`}
              >
                {isActive && (
                  <span className="absolute top-6 right-6 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900">{source.name}</h3>
                <p className="text-xs text-gray-400 font-mono mt-1 mb-6">{source.id}</p>
                <div className="bg-gray-50 rounded-xl p-4 min-h-[80px] flex items-center justify-center border border-gray-100/50">
                  <p className={`text-sm text-center font-medium ${!isRunning ? 'text-gray-400' :
                      (isActive && (globalStatus.includes('⏳') || globalStatus.includes('✅'))) ? 'text-amber-600 font-bold animate-pulse' :
                        isActive ? 'text-blue-600' : 'text-gray-400'
                    }`}>
                    {!isRunning ? 'Offline' :
                      (isActive && (globalStatus.includes('⏳') || globalStatus.includes('✅'))) ? globalStatus :
                        isActive ? 'Crawling & Generating Drafts...' : 'Waiting for next cycle...'}
                  </p>
                </div>

                {/* NEW: Take Control Button */}
                <button
                  onClick={() => handleTakeControl(source.id)}
                  className="mt-4 w-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 py-2 rounded-xl text-sm font-semibold transition-colors"
                >
                  ⚙️ Take Control (Draft Studio)
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* History Log */}
      <div className="max-w-6xl mx-auto mt-12 bg-white rounded-[2rem] shadow-sm p-8 border border-gray-100">
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

      {/* THE DRAFT STUDIO MODAL */}
      {isDrafting && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-2xl w-full border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">✨ Draft Studio</h2>
              {draftData && (
                <div className={`px-4 py-2 rounded-full font-bold font-mono text-lg ${timeLeft < 10 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-green-100 text-green-700'}`}>
                  ⏱ {timeLeft}s
                </div>
              )}
            </div>

            {!draftData ? (
              <div className="text-center py-12 text-gray-500 animate-pulse font-medium">
                Scraping article & generating AI draft...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h3 className="font-bold text-gray-800 text-sm mb-1">Source Article</h3>
                  <a href={draftData.article.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm font-medium mb-2 block">
                    {draftData.article.title}
                  </a>
                  <p className="text-gray-600 text-xs italic">from {activeCrawler}</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">AI Generated Thread (Editable)</label>
                  <textarea
                    value={editedDraft}
                    onChange={(e) => {
                      setEditedDraft(e.target.value);
                      setIsTimerPaused(true); // PAUSE TIMER IF HUMAN EDITS!
                    }}
                    className="w-full h-48 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 font-medium resize-none shadow-inner"
                  />
                </div>

                {isTimerPaused && (
                  <p className="text-amber-600 text-sm font-bold animate-pulse">⚠️ Timer paused. Manual edit mode engaged.</p>
                )}

                <div className="flex justify-end gap-3 mt-8">
                  <button
                    onClick={() => setIsDrafting(false)}
                    className="px-6 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePublish}
                    className="px-6 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                  >
                    Publish Now
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}