import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type ThreadType = 'single' | 'thread';

export interface ExperimentRecord {
    archetype_code: string;   // e.g. 'ai_...' utm label
    thread_type: ThreadType;
    is_linkless: boolean;
    slot_hour: number;   // 9 | 11 | 13 | 15 | 17
    source_domain: string;   // 'dailydiabetesnews.com'
    article_url: string;
    seo_keyword: string;
    published_at: string;   // ISO timestamp
}

// ---------------------------------------------------------------------------
// SERVICE
// ---------------------------------------------------------------------------

class ExperimentService {
    private dbType: string;
    private sqliteDb: Database.Database | null = null;
    private pgPool: Pool | null = null;

    constructor() {
        this.dbType = process.env.DB_TYPE || 'sqlite';
    }

    public async init(): Promise<void> {
        if (this.dbType === 'postgres') {
            console.log('🔗 ExperimentService: Connecting to PostgreSQL...');
            this.pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
            await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS experiment_log (
          id               SERIAL PRIMARY KEY,
          archetype_code   TEXT NOT NULL,
          thread_type      TEXT NOT NULL,
          is_linkless      BOOLEAN NOT NULL,
          slot_hour        INTEGER NOT NULL,
          source_domain    TEXT NOT NULL,
          article_url      TEXT NOT NULL,
          seo_keyword      TEXT NOT NULL,
          published_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
        } else {
            console.log('🗄️  ExperimentService: Connecting to Local SQLite...');
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

            this.sqliteDb = new Database(path.join(dataDir, 'history.db'));
            this.sqliteDb.pragma('journal_mode = WAL');
            this.sqliteDb.prepare(`
        CREATE TABLE IF NOT EXISTS experiment_log (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          archetype_code   TEXT NOT NULL,
          thread_type      TEXT NOT NULL,
          is_linkless      INTEGER NOT NULL,
          slot_hour        INTEGER NOT NULL,
          source_domain    TEXT NOT NULL,
          article_url      TEXT NOT NULL,
          seo_keyword      TEXT NOT NULL,
          published_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
        }
    }

    public async close(): Promise<void> {
        if (this.dbType === 'postgres' && this.pgPool) {
            await this.pgPool.end();
        } else if (this.sqliteDb) {
            this.sqliteDb.close();
        }
    }

    public async logExperiment(record: ExperimentRecord): Promise<void> {
        try {
            const { archetype_code, thread_type, is_linkless, slot_hour,
                source_domain, article_url, seo_keyword, published_at } = record;

            if (this.dbType === 'postgres') {
                await this.pgPool!.query(
                    `INSERT INTO experiment_log
            (archetype_code, thread_type, is_linkless, slot_hour, source_domain, article_url, seo_keyword, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [archetype_code, thread_type, is_linkless, slot_hour, source_domain, article_url, seo_keyword, published_at]
                );
            } else {
                this.sqliteDb!.prepare(
                    `INSERT INTO experiment_log
            (archetype_code, thread_type, is_linkless, slot_hour, source_domain, article_url, seo_keyword, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(archetype_code, thread_type, is_linkless ? 1 : 0, slot_hour, source_domain, article_url, seo_keyword, published_at);
            }

            console.log(`📐 Experiment logged: ${archetype_code} | ${thread_type} | linkless=${is_linkless} | slot=${slot_hour}h`);
        } catch (error) {
            // Non-fatal: logging failure must never block publishing
            console.error('⚠️ ExperimentService: Failed to log experiment:', error);
        }
    }

    public async getRecentExperiments(limit: number = 50): Promise<any[]> {
        try {
            if (this.dbType === 'postgres') {
                const res = await this.pgPool!.query(
                    'SELECT * FROM experiment_log ORDER BY published_at DESC LIMIT $1', [limit]
                );
                return res.rows;
            } else {
                return this.sqliteDb!.prepare(
                    'SELECT * FROM experiment_log ORDER BY published_at DESC LIMIT ?'
                ).all(limit) as any[];
            }
        } catch (error) {
            console.error('⚠️ ExperimentService: Failed to fetch experiments:', error);
            return [];
        }
    }
}

export const experimentService = new ExperimentService();