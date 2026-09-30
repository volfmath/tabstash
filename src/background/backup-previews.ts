import type { StorageLike } from '../lib/storage'
import type { BackupDocument } from '../lib/backup'

const BACKUP_PREVIEW_KEY = 'tabstashBackupPreviews'
const BACKUP_PREVIEW_TTL_MS = 5 * 60 * 1000
const MAX_BACKUP_PREVIEWS = 20

export interface BackupPreviewCache {
  put(document: BackupDocument): Promise<string>
  claim(token: string, document: unknown): Promise<boolean>
  release(token: string): Promise<void>
  complete(token: string): Promise<void>
}

interface BackupPreviewRecord {
  digest: string
  expiresAt: number
  claimedAt?: number
}

export class MemoryBackupPreviewCache implements BackupPreviewCache {
  private readonly records = new Map<string, BackupPreviewRecord>()

  async put(document: BackupDocument): Promise<string> {
    this.prune()
    while (this.records.size >= MAX_BACKUP_PREVIEWS) {
      const oldest = [...this.records.entries()].sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0]
      if (!oldest) break
      this.records.delete(oldest[0])
    }
    const token = crypto.randomUUID()
    this.records.set(token, { digest: await digestDocument(document), expiresAt: Date.now() + BACKUP_PREVIEW_TTL_MS })
    return token
  }

  async claim(token: string, document: unknown): Promise<boolean> {
    this.prune()
    const record = this.records.get(token)
    if (!record || record.claimedAt !== undefined || record.digest !== await digestDocument(document)) return false
    record.claimedAt = Date.now()
    return true
  }

  async complete(token: string): Promise<void> {
    this.records.delete(token)
  }

  async release(token: string): Promise<void> {
    const record = this.records.get(token)
    if (record) delete record.claimedAt
  }

  private prune(): void {
    const now = Date.now()
    for (const [token, record] of this.records) {
      if (record.expiresAt < now) this.records.delete(token)
    }
  }

}

export class SessionBackupPreviewCache implements BackupPreviewCache {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly storage: StorageLike) {}

  put(document: BackupDocument): Promise<string> {
    return this.enqueue(async () => {
      const records = await this.read()
      trimRecordsToLimit(records)
      const token = crypto.randomUUID()
      records[token] = { digest: await digestDocument(document), expiresAt: Date.now() + BACKUP_PREVIEW_TTL_MS }
      await this.write(records)
      return token
    })
  }

  claim(token: string, document: unknown): Promise<boolean> {
    return this.enqueue(async () => {
      const records = await this.read()
      const record = records[token]
      if (!record || record.expiresAt < Date.now() || record.claimedAt !== undefined || record.digest !== await digestDocument(document)) return false
      record.claimedAt = Date.now()
      await this.write(records)
      return true
    })
  }

  complete(token: string): Promise<void> {
    return this.enqueue(async () => {
      const records = await this.read()
      delete records[token]
      await this.write(records)
    })
  }

  release(token: string): Promise<void> {
    return this.enqueue(async () => {
      const records = await this.read()
      const record = records[token]
      if (record) delete record.claimedAt
      await this.write(records)
    })
  }

  private async read(): Promise<Record<string, BackupPreviewRecord>> {
    const result = await this.storage.get(BACKUP_PREVIEW_KEY)
    const value = result[BACKUP_PREVIEW_KEY]
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const records = { ...(value as Record<string, BackupPreviewRecord>) }
    const now = Date.now()
    for (const [token, record] of Object.entries(records)) {
      if (!record || record.expiresAt < now) delete records[token]
    }
    return records
  }

  private async write(records: Record<string, BackupPreviewRecord>): Promise<void> {
    await this.storage.set({ [BACKUP_PREVIEW_KEY]: records })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.writeQueue.then(operation, operation)
    this.writeQueue = task.then(() => undefined, () => undefined)
    return task
  }
}

async function digestDocument(document: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(document))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function trimRecordsToLimit(records: Record<string, BackupPreviewRecord>): void {
  const entries = () => Object.entries(records)
  while (entries().length >= MAX_BACKUP_PREVIEWS) {
    const oldest = Object.entries(records).sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0]
    if (!oldest) return
    delete records[oldest[0]]
  }
}
