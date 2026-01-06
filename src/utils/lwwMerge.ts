/**
 * Last-Writer-Wins (LWW) Merge Utility
 * 
 * Implements conflict resolution using logical timestamps (Lamport-style).
 * When two versions of the same record exist, the one with the higher
 * timestamp wins. Ties are broken deterministically using client ID.
 */

export interface RecordWithId {
    id: string;
    [key: string]: unknown;
}

export type RecordMap = Record<string, RecordWithId>;

/**
 * Logical timestamp with client ID for deterministic ordering.
 * This handles clock drift between clients.
 */
export interface LogicalTimestamp {
    time: number;
    clientId: string;
}

export type TimestampMap = Record<string, LogicalTimestamp>;

// Legacy format support (just numbers)
export type LegacyTimestampMap = Record<string, number>;

/**
 * Compare two logical timestamps.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareTimestamps(a: LogicalTimestamp, b: LogicalTimestamp): number {
    if (a.time !== b.time) {
        return a.time - b.time;
    }
    // Deterministic tie-break using client ID
    return a.clientId.localeCompare(b.clientId);
}

/**
 * Convert legacy timestamp (number) to LogicalTimestamp.
 */
export function toLogicalTimestamp(ts: number | LogicalTimestamp, clientId?: string): LogicalTimestamp {
    if (typeof ts === 'object' && 'time' in ts) {
        return ts;
    }
    return { time: ts, clientId: clientId || 'unknown' };
}

/**
 * Create a new logical timestamp for local changes.
 */
export function createTimestamp(clientId: string): LogicalTimestamp {
    return { time: Date.now(), clientId };
}

/**
 * Merge two sets of records using Last-Writer-Wins strategy.
 * 
 * @param localRecords - Local record map
 * @param localTimestamps - Timestamps for local records
 * @param remoteRecords - Remote record map from server
 * @param remoteTimestamps - Timestamps for remote records (optional, defaults to current time)
 * @param localClientId - Client ID for tie-breaking
 * @returns Merged records and updated timestamps
 */
export function mergeWithLWW(
    localRecords: RecordMap,
    localTimestamps: TimestampMap | LegacyTimestampMap,
    remoteRecords: RecordMap,
    remoteTimestamps?: TimestampMap | LegacyTimestampMap,
    localClientId: string = 'local'
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

        const rawLocalTs = localTimestamps[id];
        const rawRemoteTs = remoteTimestamps?.[id];

        const localTs = rawLocalTs
            ? toLogicalTimestamp(rawLocalTs as number | LogicalTimestamp, localClientId)
            : { time: 0, clientId: localClientId };
        const remoteTs = rawRemoteTs
            ? toLogicalTimestamp(rawRemoteTs as number | LogicalTimestamp, 'remote')
            : { time: now, clientId: 'remote' };

        if (localRecord && !remoteRecord) {
            // Only exists locally - keep local (it's a local add or remote delete)
            mergedRecords[id] = localRecord;
            mergedTimestamps[id] = localTs;
        } else if (!localRecord && remoteRecord) {
            // Only exists remotely - add from remote
            mergedRecords[id] = remoteRecord;
            mergedTimestamps[id] = remoteTs;
        } else if (localRecord && remoteRecord) {
            // Exists in both - LWW: higher timestamp wins
            if (compareTimestamps(localTs, remoteTs) >= 0) {
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

