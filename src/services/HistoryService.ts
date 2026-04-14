import Database from "better-sqlite3";
import { Pool } from "pg";
import path from "path";
import fs from "fs";

export class HistoryService {
    private dbType: string;
    private sqliteDb: Database.Database | null = null;
    private pgPool: Pool | null = null;

    constructor() {
        // const dataDir = path.join(process.cwd(), 'data');
        // if (!fs.existsSync(dataDir)) {
        //     fs.mkdirSync(dataDir);
        // }

        // Initialize the SQLite database
        // this.db = new Database(path.join(dataDir, 'history.db'));
        // Enable Concurrent Read/Writes (WAL Mode)
        // this.db.pragma('journal_mode = WAL');
        // this.initDb();
        this.dbType = process.env.DB_TYPE || 'sqlite';
    }

    public async close(): Promise<void> {
        if (this.dbType === 'postgres' && this.pgPool) {
            console.log('📦 Closing PostgreSQL connection...');
            await this.pgPool.end();
        } else if (this.sqliteDb) {
            console.log('📦 Safely closing SQLite database...');
            this.sqliteDb.close();
        }
    }

    // Postgres requires network connections, initialization must be async
    public async init(): Promise<void> {
        if (this.dbType === 'postgres') {
            console.log('🔗 Connecting to PostgreSQL Cluster...');
            this.pgPool = new Pool({
                connectionString: process.env.DATABASE_URL,
            });
            await this.pgPool.query(`
                CREATE TABLE IF NOT EXISTS published_articles (
                    title TEXT,
                    url TEXT PRIMARY KEY,
                    source_name TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            console.log('🗄️  Connecting to Local SQLite...');
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }

            // Initialize better-sqlite3
            this.sqliteDb = new Database(path.join(dataDir, 'history.db'));
            this.sqliteDb.pragma('journal_mode = WAL');

            this.sqliteDb.prepare(`
                CREATE TABLE IF NOT EXISTS published_articles (
                    title TEXT,
                    url TEXT PRIMARY KEY,
                    source_name TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `).run();
        }
    }

    // Check if a URL is already in the database
    public async isArticleCrawled(url: string): Promise<boolean> {
        if (this.dbType === 'postgres') {
            const res = await this.pgPool!.query('SELECT url FROM published_articles WHERE url = $1', [url]);
            return (res.rowCount ?? 0) > 0;
        } else {
            const stmt = this.sqliteDb!.prepare('SELECT url FROM published_articles WHERE url = ?');
            const row = stmt.get(url);
            return !!row;
        }
    }

    public async markArticleCrawled(title: string, sourceName: string, url: string): Promise<void> {
        try {
            if (this.dbType === 'postgres') {
                // Postgres uses "ON CONFLICT DO NOTHING" instead of "INSERT OR IGNORE"
                await this.pgPool!.query(
                    'INSERT INTO published_articles (title, source_name, url) VALUES ($1, $2, $3) ON CONFLICT (url) DO NOTHING',
                    [title, sourceName, url]
                );
            } else {
                const stmt = this.sqliteDb!.prepare('INSERT OR IGNORE INTO published_articles (title, source_name, url) VALUES (?, ?, ?)');
                stmt.run(title, sourceName, url);
            }
            console.log(`Saved to history: ${url}`);
        } catch (error) {
            console.error(`Failed to save to history: ${url}`, error);
        }
    }

    public async getRecentHistory(limit: number = 50): Promise<any[]> {
        try {
            if (this.dbType === 'postgres') {
                const res = await this.pgPool!.query('SELECT * FROM published_articles ORDER BY timestamp DESC LIMIT $1', [limit]);
                return res.rows;
            } else {
                const stmt = this.sqliteDb!.prepare('SELECT * FROM published_articles ORDER BY timestamp DESC LIMIT ?');
                return stmt.all(limit) as any[];
            }
        } catch (error) {
            console.error('Failed to fetch history', error);
            return [];
        }
    }
}

export const historyService = new HistoryService();