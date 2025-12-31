/**
 * Last-Writer-Wins (LWW) Merge Utility
 * 
 * Implements conflict resolution by comparing timestamps.
 * When two versions of the same record exist, the one with
 * the higher (more recent) timestamp wins.
 */

export interface RecordWithId {
    id: string;
    [key: string]: unknown;
}

export type RecordMap = Record<string, RecordWithId>;
export type TimestampMap = Record<string, number>;

/**
 * Merge two sets of records using Last-Writer-Wins strategy.
 * 
 * @param localRecords - Local record map
 * @param localTimestamps - Timestamps for local records
 * @param remoteRecords - Remote record map from server
 * @param remoteTimestamps - Timestamps for remote records (optional, defaults to current time)
 * @returns Merged records and updated timestamps
 */
export function mergeWithLWW(
    localRecords: RecordMap,
    localTimestamps: TimestampMap,
    remoteRecords: RecordMap,
    remoteTimestamps?: TimestampMap
): { records: RecordMap; timestamps: TimestampMap } {
    const now = Date.now();
    const mergedRecords: RecordMap = {};
    const mergedTimestamps: TimestampMap = {};

    // Get all unique record IDs from both local and remote
    const allIds = new Set([
        ...Object.keys(localRecords),
        ...Object.keys(remoteRecords),
    ]);

    for (const id of allIds) {
        const localRecord = localRecords[id];
        const remoteRecord = remoteRecords[id];
        const localTs = localTimestamps[id] || 0;
        const remoteTs = remoteTimestamps?.[id] || now;

        if (localRecord && !remoteRecord) {
            // Only exists locally - keep local (it's a local add or remote delete)
            // If remote deleted it, remote should have a higher timestamp for deletion
            // For simplicity, keep local additions
            mergedRecords[id] = localRecord;
            mergedTimestamps[id] = localTs;
        } else if (!localRecord && remoteRecord) {
            // Only exists remotely - add from remote
            mergedRecords[id] = remoteRecord;
            mergedTimestamps[id] = remoteTs;
        } else if (localRecord && remoteRecord) {
            // Exists in both - LWW: higher timestamp wins
            if (localTs >= remoteTs) {
                // Local wins (or tie goes to local for user experience)
                mergedRecords[id] = localRecord;
                mergedTimestamps[id] = localTs;
            } else {
                // Remote wins
                mergedRecords[id] = remoteRecord;
                mergedTimestamps[id] = remoteTs;
            }
        }
        // If neither exists, skip (shouldn't happen given our Set)
    }

    return { records: mergedRecords, timestamps: mergedTimestamps };
}

/**
 * Extract changed records by comparing two record maps.
 * Returns put (new), update (modified), and remove (deleted) changes.
 */
export function diffRecords(
    oldRecords: RecordMap,
    newRecords: RecordMap
): {
    put: RecordWithId[];
    update: Array<{ id: string; after: RecordWithId }>;
    remove: Array<{ id: string }>;
} {
    const put: RecordWithId[] = [];
    const update: Array<{ id: string; after: RecordWithId }> = [];
    const remove: Array<{ id: string }> = [];

    // Find new and updated records
    for (const [id, record] of Object.entries(newRecords)) {
        if (!oldRecords[id]) {
            // New record
            put.push(record);
        } else if (JSON.stringify(oldRecords[id]) !== JSON.stringify(record)) {
            // Modified record
            update.push({ id, after: record });
        }
    }

    // Find removed records
    for (const id of Object.keys(oldRecords)) {
        if (!newRecords[id]) {
            remove.push({ id });
        }
    }

    return { put, update, remove };
}

/**
 * Check if there are any changes to sync.
 */
export function hasChanges(changes: {
    put: unknown[];
    update: unknown[];
    remove: unknown[];
}): boolean {
    return changes.put.length > 0 || changes.update.length > 0 || changes.remove.length > 0;
}
