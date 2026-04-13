import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export class HistoryService {
    private db: Database.Database;

    constructor() {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }

        // Initialize the SQLite database
        this.db = new Database(path.join(dataDir, 'history.db'));
        // Enable Concurrent Read/Writes (WAL Mode)
        this.db.pragma('journal_mode = WAL');
        this.initDb();
    }

    public close() {
        console.log('📦 Safely closing SQLite database...');
        this.db.close();
    }

    private initDb() {
        // Create the table if it doesn't exist yet
        const stmt = this.db.prepare(`
            CREATE TABLE IF NOT EXISTS published_articles (
                title TEXT,
                url TEXT PRIMARY KEY,
                source_name TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        stmt.run();
    }

    // Check if a URL is already in the database
    public isArticleCrawled(url: string): boolean {
        const stmt = this.db.prepare('SELECT url FROM published_articles WHERE url = ?');
        const row = stmt.get(url);
        return !!row;
    }

    public markArticleCrawled(title: string, sourceName: string, url: string): void {
        try {
            // INSERT OR IGNORE safely handles any accidental duplicate attempts
            const stmt = this.db.prepare('INSERT INTO published_articles (title, source_name, url) VALUES (?, ?, ?)');
            stmt.run(title, sourceName, url);
            console.log(`Saved to history: ${url}`);
        } catch (error) {
            console.error(`Failed to save to history: ${url}`, error);
        }
    }

    public getRecentHistory(limit: number = 50) {
        try {
            // We order by timestamp descending so the newest posts are at the top
            const stmt = this.db.prepare('SELECT * FROM published_articles ORDER BY timestamp DESC LIMIT ?');
            return stmt.all(limit);
        } catch (error) {
            console.error('Failed to fetch history', error);
            return [];
        }
    }
}

export const historyService = new HistoryService();