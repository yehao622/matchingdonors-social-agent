import styles from './NewsWidget.module.css';

// 1. Define the exact same interface you have in App.tsx
interface HistoryItem {
  timestamp: string;
  source_name: string;
  url: string;
  title?: string;
}

// 2. Define the "Props" this component expects to receive
interface NewsWidgetProps {
  history: HistoryItem[];
}

export default function NewsWidget({ history }: NewsWidgetProps) {
  return (
    <div className={styles.widgetContainer}>
      <div className={styles.header}>
        <span className={styles.liveIndicator}></span>
        <h2>Live Transplant News</h2>
      </div>

      <div className={styles.feedScrollArea}>
        {/* 3. Handle the empty state while waiting for the first API poll */}
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: '12px', color: '#999', marginTop: '40px' }}>
            Waiting for live updates...
          </div>
        ) : (
          /* 4. Map over the REAL history data passed from App.tsx */
          history.map((item, idx) => (
            <div key={idx} className={styles.newsCard}>
              <div className={styles.cardHeader}>
                <span className={styles.sourceTag}>{item.source_name}</span>
                <span className={styles.date}>
                  {/* Format the UTC timestamp exactly as you had it */}
                  {new Date(item.timestamp.replace(' ', 'T') + 'Z').toLocaleDateString()}
                </span>
              </div>

              {/* 5. Make the title a clickable link to the article */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <p className={styles.cardTitle}>
                  {item.title && item.title.length > 0 ? item.title : item.url}
                </p>
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
