import { Injectable, Logger } from '@nestjs/common';
import { StringSession, StoreSession } from 'telegram/sessions';
import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SESSION_STRING_FILE = 'session.string';

@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private sessionFolder: string;

  constructor() {
    this.sessionFolder = process.env.TELEGRAM_SESSION_FOLDER || 'sessions';
  }

  setSessionFolder(folder: string): void {
    this.sessionFolder = folder;
  }

  createSession(sessionString?: string): StoreSession | StringSession {
    if (sessionString) {
      this.logger.log('Using StringSession from environment variable');
      return new StringSession(sessionString);
    }
    this.logger.log(`Using StoreSession in folder: ${this.sessionFolder}`);
    return new StoreSession(this.sessionFolder);
  }

  async saveSessionString(sessionData: string): Promise<void> {
    try {
      const dir = join(process.cwd(), this.sessionFolder);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      const filePath = join(dir, SESSION_STRING_FILE);
      await writeFile(filePath, sessionData, 'utf-8');
      this.logger.log('Session string saved to disk for recovery');
    } catch (error) {
      this.logger.error('Failed to save session string', error);
    }
  }

  async loadSessionString(): Promise<string | null> {
    try {
      const filePath = join(process.cwd(), this.sessionFolder, SESSION_STRING_FILE);
      if (!existsSync(filePath)) return null;
      const data = await readFile(filePath, 'utf-8');
      if (!data.trim()) return null;
      return data.trim();
    } catch {
      return null;
    }
  }

  /**
   * Clears every persisted session file (session.string + folder auth keys).
   * Used when Telegram revokes the auth key (AUTH_KEY_UNREGISTERED) so the
   * client stops reconnecting with a dead key and a fresh login can start.
   */
  async clearPersistedSessions(): Promise<void> {
    try {
      const dir = join(process.cwd(), this.sessionFolder);
      if (!existsSync(dir)) return;
      for (const file of await readdir(dir)) {
        await unlink(join(dir, file));
      }
      this.logger.warn('Saved Telegram sessions cleared');
    } catch (error) {
      this.logger.error('Failed to clear saved sessions', error);
    }
  }
}
