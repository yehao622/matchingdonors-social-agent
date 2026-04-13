import { useState, useEffect } from 'react';
import { api } from './apiClient';
import { StatusBadge } from './components/StatusBadge';
import { Button } from './components/Button';

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
  title?: string;
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
  const [serverError, setServerError] = useState<string | null>(null);

  // Detect if the iframe is asking for the widget!
  const isWidgetMode = new URLSearchParams(window.location.search).get('mode') === 'widget';

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
        setServerError(null);
        setHistory(historyData);
      } catch (error) {
        setGlobalStatus(`⚠️ Disconnected from Backend Server. ${error}`);
        setServerError("Cannot connect to backend server. Is the engine running?");
        setIsRunning(false);
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
      } else {
        await api.startEngine();
        setIsRunning(true);
      }
    } catch (error) {
      console.error('Failed to toggle engine', error);
      setServerError("Failed to communicate with the engine. Check terminal.");
    }
  };

  const fetchDraft = async (sourceId: string) => {
    setIsDrafting(true);
    setDraftData(null); // Triggers the loading spinner
    setTimeLeft(30);
    setIsTimerPaused(false);
    setServerError(null);

    try {
      const data = await api.getStudioDraft(sourceId);
      setDraftData(data);
      setEditedDraft(data.posts.join('\n\n'));
    } catch (error) {
      console.error("Draft generation failed", error);
      setServerError("Failed to generate manual draft. Check terminal for details.");
      setIsDrafting(false); // Cancel draft mode on failure
    }
  };

  // ==========================================
  // 2. DRAFT STUDIO CONTROLS
  // ==========================================
  // const handleTakeControl = async (crawlerId: string) => {
  //   // Instantly pause the background engine!
  //   if (isRunning) {
  //     await api.stopEngine();
  //     setIsRunning(false);
  //     setGlobalStatus('⚙️ Manual Override Engaged (Engine Paused)');
  //   }

  //   setIsDrafting(true);
  //   setActiveCrawler(crawlerId);
  //   setDraftData(null);
  //   setTimeLeft(30);
  //   setIsTimerPaused(false);

  //   try {
  //     const data = await api.getStudioDraft(crawlerId);
  //     setDraftData(data);
  //     setEditedDraft(data.posts.join('\n\n'));
  //   } catch (error) {
  //     alert(`Failed to generate draft. Check backend console.: ${error}`);
  //     setIsDrafting(false);
  //   }
  // };

  const handlePublish = async () => {
    if (!draftData) return;

    setIsTimerPaused(true);
    try {
      // Convert the text box back into an array for the backend
      const postsArray = editedDraft.split('\n\n').filter(p => p.trim() !== '');
      if (postsArray.length === 0) return alert('Cannot publish empty posts!');

      const overLimitIndex = postsArray.findIndex(p => p.length > 300);
      if (overLimitIndex !== -1) {
        setIsTimerPaused(true); // Keep timer paused!
        return alert(`Wait! Post ${overLimitIndex + 1} is over the 300 character limit (${postsArray[overLimitIndex].length} chars). Please manually shorten it before publishing.`);
      }

      await api.publishPost(postsArray, activeCrawler || 'Manual', draftData.article.url, draftData.article.title);
      setIsDrafting(false);

      await api.startEngine();
      setIsRunning(true);
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
  if (isWidgetMode) {
    return (
      <div className="h-screen w-full bg-[#f9fafb] flex flex-col font-sans border-t-4 border-blue-600 overflow-hidden">
        <div className="p-4 bg-white border-b border-gray-100 flex items-center shadow-sm z-10 shrink-0">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            Live Transplant News
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="text-xs text-center text-gray-400 mt-10 font-medium">Waiting for live updates...</div>
          ) : (
            history.map((row, idx) => (
              <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wide">
                    {row.source_name}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-2">
                    {new Date(row.timestamp.replace(' ', 'T') + 'Z').toLocaleDateString()}
                  </span>
                </div>
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-gray-900 hover:text-blue-600 hover:underline line-clamp-2 leading-snug">
                  {row.title && row.title.length > 0 ? row.title : row.url}
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-8 font-sans text-gray-800">

      {/* Server Error Banner */}
      {serverError && (
        <div className="max-w-7xl mx-auto bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm">
          <p className="text-red-700 font-bold">⚠️ Connection Error</p>
          <p className="text-red-600 text-sm">{serverError}</p>
        </div>
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">AI Social Agent</h1>
          <p className="text-gray-500 mt-1 font-medium">{globalStatus}</p>
        </div>
        <div className="flex items-center gap-4">
          <StatusBadge isRunning={isRunning} />
          <Button
            variant={isRunning ? "secondary" : "primary"}
            onClick={toggleEngine}
          >
            {isRunning ? 'Stop Auto-Pilot' : 'Start Auto-Pilot'}
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Data Sources & History */}
        <div className="lg:col-span-2 space-y-8">
          {/* Data Sources Grid */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">📡 Intelligence Sources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CRAWLER_SOURCES.map((source) => {
                // Real-time status parsing!
                const isActive = isRunning && globalStatus.includes(source.id);
                const isWaiting = isActive && globalStatus.includes('Auto-publishing in');

                return (
                  <div
                    key={source.id}
                    className={`p-4 border rounded-xl transition-all duration-300 flex flex-col justify-between ${isWaiting ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/50' :
                      isActive ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-400/20 shadow-md' :
                        'border-gray-100 bg-gray-50/50 hover:shadow-md'
                      }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className={`font-bold text-lg ${isActive ? 'text-blue-900' : 'text-gray-800'}`}>{source.name}</h3>
                        {isActive && !isWaiting && (
                          <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono mt-1 mb-3">ID: {source.id}</p>

                      {/* Dynamic Visual Status Text */}
                      {isWaiting && <p className="text-sm font-bold text-amber-600 animate-pulse mb-3">⏳ Ghost Timer Active!</p>}
                      {isActive && !isWaiting && <p className="text-sm font-bold text-blue-600 mb-3">📡 Crawling...</p>}
                    </div>

                    <Button
                      variant={isWaiting ? "primary" : "secondary"}
                      size="sm"
                      className="w-full mt-2"
                      disabled={isDrafting && activeCrawler === source.id}
                      onClick={async () => {
                        if (isRunning) {
                          await api.stopEngine();
                          setIsRunning(false);
                        }
                        setActiveCrawler(source.id);
                        fetchDraft(source.id);
                      }}
                    >
                      {isDrafting && activeCrawler === source.id ? (
                        <span className="animate-pulse">Loading Draft...</span>
                      ) : 'Take Control'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-bold mb-4">📝 Activity Log</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider text-xs">
                    <th className="pb-3 font-bold">Timestamp (UTC)</th>
                    <th className="pb-3 font-bold">Source</th>
                    <th className="pb-3 font-bold">Article Title</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 text-gray-500 font-medium whitespace-nowrap">
                        {row.timestamp.replace(' ', 'T')}Z
                      </td>
                      <td className="py-3">
                        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded text-xs uppercase tracking-wide">
                          {row.source_name}
                        </span>
                      </td>
                      <td className="py-3 font-medium">
                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {row.title && row.title.length > 0 ? row.title : 'Missing Title (Legacy Entry)'}
                        </a>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-gray-400 font-medium italic">
                        No articles published yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Draft Studio Overlay */}
        <div className="lg:col-span-1 relative">
          <div className={`sticky top-8 transition-all duration-300 ${isDrafting ? 'opacity-100 scale-100' : 'opacity-50 grayscale pointer-events-none'}`}>
            <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-500 p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500"></div>

              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Draft Studio</h2>
                  <p className="text-blue-600 font-bold text-sm">Manual Override Engaged</p>
                </div>
                {/* Visual Ghost Timer */}
                {isDrafting && (
                  <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-full border-4 shadow-sm ${isTimerPaused ? 'border-amber-400 bg-amber-50' : 'border-blue-500 bg-blue-50'}`}>
                    <span className={`text-xl font-black ${isTimerPaused ? 'text-amber-600' : 'text-blue-700'}`}>
                      {timeLeft}
                    </span>
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest -mt-1">SEC</span>
                  </div>
                )}
              </div>

              {!isDrafting ? (
                // STATE 1: STANDBY MODE
                <div className="h-64 flex flex-col items-center justify-center space-y-4">
                  {!isRunning ? (
                    // System Offline
                    <div className="flex flex-col items-center text-gray-400">
                      <svg className="w-12 h-12 opacity-30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      <p className="font-bold tracking-wide uppercase text-sm">System Offline</p>
                      <p className="text-xs text-center px-8 mt-2">Start the Auto-Pilot to begin monitoring.</p>
                    </div>
                  ) : globalStatus.includes('Auto-publishing in') ? (
                    // Ghost Timer Warning!
                    <div className="flex flex-col items-center text-amber-500">
                      <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4"></div>
                      <p className="font-bold tracking-wide uppercase text-sm text-amber-600">Ghost Timer Active</p>
                      <p className="text-xs text-center px-8 text-amber-600 mt-2 font-medium">Draft is ready! Click 'Take Control' on the active card to intercept.</p>
                    </div>
                  ) : globalStatus.includes('Shortening') || globalStatus.includes('Gemini') || globalStatus.includes('Crawling') ? (
                    // Engine is actively working
                    <div className="flex flex-col items-center text-blue-500">
                      <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                      <p className="font-bold tracking-wide uppercase text-sm text-blue-600">Auto-Pilot Processing</p>
                      <p className="text-xs text-center px-8 text-blue-500 mt-2 font-medium text-center line-clamp-2">{globalStatus}</p>
                    </div>
                  ) : (
                    // Engine is resting between minutes
                    <div className="flex flex-col items-center text-gray-400">
                      <svg className="w-12 h-12 opacity-50 animate-pulse mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="font-bold tracking-wide uppercase text-sm">Scanning for News...</p>
                    </div>
                  )}
                </div>

              ) : !draftData ? (
                // STATE 2: LOADING (Gemini is thinking)
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 space-y-4">
                  <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
                  <p className="font-medium animate-pulse">Gemini is writing...</p>
                </div>
              ) : (
                // STATE 3: MANUAL EDITOR
                <div className="space-y-6">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Source Article</p>
                    <a href={draftData.article.url} target="_blank" rel="noopener noreferrer" className="font-bold text-gray-800 hover:text-blue-600 leading-snug">
                      {draftData.article.title}
                    </a>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Review Thread</label>
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
                    {/* DRY Buttons for Cancel and Publish */}
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        setIsDrafting(false);
                        setDraftData(null);
                        await api.startEngine();
                        setIsRunning(true);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handlePublish}
                    >
                      Publish Now
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}