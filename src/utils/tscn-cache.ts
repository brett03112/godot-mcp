/**
 * TSCN Scene Parse Cache (Tier 2 — Phase 2A)
 *
 * Caches parsed .tscn files in memory with mtime-based invalidation.
 * Avoids re-parsing the same scene file across multiple tool calls.
 * Write operations should call invalidate() to keep the cache consistent.
 */

import { statSync } from 'fs';
import { TscnFile, parseTscnFile } from './tscn-parser.js';

interface CacheEntry {
  /** File modification time when the cache was populated */
  mtime: number;
  /** The parsed TSCN structure */
  parsed: TscnFile;
}

export class TscnCache {
  private cache: Map<string, CacheEntry> = new Map();

  /**
   * Get a parsed TSCN file, using the cache if the file hasn't changed.
   * Returns the parsed TscnFile, or throws if the file cannot be read.
   */
  getOrParse(filePath: string): TscnFile {
    const currentMtime = this.getFileMtime(filePath);
    const entry = this.cache.get(filePath);

    if (entry && entry.mtime === currentMtime) {
      return entry.parsed;
    }

    // Parse and cache
    const parsed = parseTscnFile(filePath);
    this.cache.set(filePath, { mtime: currentMtime, parsed });
    return parsed;
  }

  /**
   * Invalidate a specific file's cache entry.
   * Call this after any write operation that modifies a scene file.
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if a file is currently cached (and still valid).
   */
  has(filePath: string): boolean {
    const entry = this.cache.get(filePath);
    if (!entry) return false;
    try {
      return entry.mtime === this.getFileMtime(filePath);
    } catch {
      this.cache.delete(filePath);
      return false;
    }
  }

  private getFileMtime(filePath: string): number {
    return statSync(filePath).mtimeMs;
  }
}
