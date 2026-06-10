import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

export type BanditActionKey = 'thread_linked' | 'single_linkless';
export type RewardStatus = 'pending' | 'resolved';

export interface BanditContextInput {
    relevanceScore: number;
    sourceName?: string;
    seoKeyword?: string;
    slotHour?: number;
}

export interface BanditDecision {
    contextBucket: string;
    actionKey: BanditActionKey;
    epsilonUsed: boolean;
}

export interface PendingBanditRecord {
    article_url: string;
    context_bucket: string;
    action_key: BanditActionKey;
    reward_status: RewardStatus;
    reward: number | null;
    published_at: string;
    resolved_at: string | null;
}

interface ActionStatsRow {
    action_key: BanditActionKey;
    trials: number;
    successes: number;
    avg_reward: number;
}

class BanditService {
    private dbType: string;
    private sqliteDb: Database.Database | null = null;
    private pgPool: Pool | null = null;

    private readonly epsilon = 0.2;

    private readonly actionCatalog: readonly BanditActionKey[] = [
        'thread_linked',
        'single_linkless'
    ];

    constructor() {
        this.dbType = process.env.DB_TYPE || 'sqlite';
    }

    public async init(): Promise<void> {
        if (this.dbType === 'postgres') {
            console.log('🔗 BanditService: Connecting to PostgreSQL...');
            this.pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

            await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS bandit_feedback (
          id SERIAL PRIMARY KEY,
          article_url TEXT NOT NULL UNIQUE,
          context_bucket TEXT NOT NULL,
          action_key TEXT NOT NULL,
          reward_status TEXT NOT NULL,
          reward DOUBLE PRECISION NULL,
          published_at TIMESTAMP NOT NULL,
          resolved_at TIMESTAMP NULL
        )
      `);
        } else {
            console.log('🗄️ BanditService: Connecting to Local SQLite...');
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

            this.sqliteDb = new Database(path.join(dataDir, 'history.db'));
            this.sqliteDb.pragma('journal_mode = WAL');

            this.sqliteDb.prepare(`
        CREATE TABLE IF NOT EXISTS bandit_feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_url TEXT NOT NULL UNIQUE,
          context_bucket TEXT NOT NULL,
          action_key TEXT NOT NULL,
          reward_status TEXT NOT NULL,
          reward REAL NULL,
          published_at DATETIME NOT NULL,
          resolved_at DATETIME NULL
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

    public getAvailableActions(): readonly BanditActionKey[] {
        return this.actionCatalog;
    }

    public buildContextBucket(input: BanditContextInput): string {
        const relevanceBucket = this.getRelevanceBucket(input.relevanceScore);
        return relevanceBucket;
    }

    public async chooseAction(input: BanditContextInput): Promise<BanditDecision> {
        const contextBucket = this.buildContextBucket(input);
        const stats = await this.getActionStats(contextBucket);

        const shouldExplore = Math.random() < this.epsilon;

        if (shouldExplore) {
            return {
                contextBucket,
                actionKey: this.pickRandomAction(),
                epsilonUsed: true
            };
        }

        const bestAction = this.pickBestAction(stats);

        return {
            contextBucket,
            actionKey: bestAction,
            epsilonUsed: false
        };
    }

    public async logPendingDecision(record: {
        articleUrl: string;
        contextBucket: string;
        actionKey: BanditActionKey;
        publishedAt: string;
    }): Promise<void> {
        try {
            if (this.dbType === 'postgres') {
                await this.pgPool!.query(
                    `
          INSERT INTO bandit_feedback
          (article_url, context_bucket, action_key, reward_status, reward, published_at, resolved_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (article_url) DO NOTHING
          `,
                    [
                        record.articleUrl,
                        record.contextBucket,
                        record.actionKey,
                        'pending',
                        null,
                        record.publishedAt,
                        null
                    ]
                );
            } else {
                this.sqliteDb!.prepare(
                    `
          INSERT OR IGNORE INTO bandit_feedback
          (article_url, context_bucket, action_key, reward_status, reward, published_at, resolved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `
                ).run(
                    record.articleUrl,
                    record.contextBucket,
                    record.actionKey,
                    'pending',
                    null,
                    record.publishedAt,
                    null
                );
            }
        } catch (error) {
            console.error('⚠️ BanditService: Failed to log pending decision:', error);
        }
    }

    public getActionExecutionPlan(actionKey: BanditActionKey): {
        forceThread: boolean;
        forceLinkless: boolean;
    } {
        switch (actionKey) {
            case 'thread_linked':
                return { forceThread: true, forceLinkless: false };
            case 'single_linkless':
                return { forceThread: false, forceLinkless: true };
            default:
                return { forceThread: true, forceLinkless: false };
        }
    }

    private getRelevanceBucket(relevanceScore: number): string {
        if (relevanceScore >= 6) return 'high';
        return 'borderline';
    }

    private pickRandomAction(): BanditActionKey {
        const index = Math.floor(Math.random() * this.actionCatalog.length);
        return this.actionCatalog[index] ?? 'thread_linked';
    }

    private pickBestAction(stats: ActionStatsRow[]): BanditActionKey {
        if (stats.length === 0) {
            return 'thread_linked';
        }

        const sorted = [...stats].sort((a, b) => {
            if (b.avg_reward !== a.avg_reward) return b.avg_reward - a.avg_reward;
            return a.trials - b.trials;
        });

        return sorted[0]?.action_key ?? 'thread_linked';
    }

    private async getActionStats(contextBucket: string): Promise<ActionStatsRow[]> {
        try {
            let rows: Array<{ action_key: string; trials: number; successes: number; avg_reward: number }> = [];

            if (this.dbType === 'postgres') {
                const res = await this.pgPool!.query(
                    `
          SELECT
            action_key,
            COUNT(*)::int AS trials,
            COALESCE(SUM(CASE WHEN reward > 0 THEN 1 ELSE 0 END), 0)::int AS successes,
            COALESCE(AVG(COALESCE(reward, 0)), 0) AS avg_reward
          FROM bandit_feedback
          WHERE context_bucket = $1
            AND reward_status = 'resolved'
          GROUP BY action_key
          `,
                    [contextBucket]
                );
                rows = res.rows;
            } else {
                rows = this.sqliteDb!.prepare(
                    `
          SELECT
            action_key,
            COUNT(*) AS trials,
            COALESCE(SUM(CASE WHEN reward > 0 THEN 1 ELSE 0 END), 0) AS successes,
            COALESCE(AVG(COALESCE(reward, 0)), 0) AS avg_reward
          FROM bandit_feedback
          WHERE context_bucket = ?
            AND reward_status = 'resolved'
          GROUP BY action_key
          `
                ).all(contextBucket) as any[];
            }

            const mapped = new Map<BanditActionKey, ActionStatsRow>();

            for (const actionKey of this.actionCatalog) {
                mapped.set(actionKey, {
                    action_key: actionKey,
                    trials: 0,
                    successes: 0,
                    avg_reward: 0
                });
            }

            for (const row of rows) {
                const actionKey = row.action_key as BanditActionKey;
                if (!mapped.has(actionKey)) continue;

                mapped.set(actionKey, {
                    action_key: actionKey,
                    trials: Number(row.trials) || 0,
                    successes: Number(row.successes) || 0,
                    avg_reward: Number(row.avg_reward) || 0
                });
            }

            return Array.from(mapped.values());
        } catch (error) {
            console.error('⚠️ BanditService: Failed to load action stats:', error);
            return this.actionCatalog.map((actionKey) => ({
                action_key: actionKey,
                trials: 0,
                successes: 0,
                avg_reward: 0
            }));
        }
    }
}

export const banditService = new BanditService();