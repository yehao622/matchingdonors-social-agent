export function StatusBadge({ isRunning }: { isRunning: boolean }) {
    return (
        <span className={`px-3 py-1 text-xs font-bold rounded-full border shadow-inner flex items-center gap-2
      ${isRunning
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'}`}
        >
            {isRunning && (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
            )}
            {isRunning ? 'ENGINE ONLINE' : 'ENGINE OFFLINE'}
        </span>
    );
}

export default StatusBadge;