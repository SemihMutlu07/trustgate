import { Firestore } from '@google-cloud/firestore';
import crypto from 'node:crypto';
import type { EvidenceCard } from './types.js';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'trustgate-dev-505913';

let firestoreClient: Firestore | null = null;

function getFirestore(): Firestore | null {
  if (firestoreClient) return firestoreClient;
  try {
    firestoreClient = new Firestore({ projectId });
    return firestoreClient;
  } catch (err) {
    console.warn('⚠️ Firestore initialization fallback: Using local memory ledger.');
    return null;
  }
}

export function computeCardHash(card: Partial<EvidenceCard>): string {
  const payload = JSON.stringify({
    taskId: card.taskId,
    intent: card.intent,
    status: card.status,
    modifiedFiles: card.modifiedFiles,
    violationsCount: card.violationsBlocked?.length ?? 0,
    verified: card.verification?.verified ?? false,
    exitCode: card.verification?.exitCode ?? -1,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export interface StoredEvidenceRecord {
  id: string;
  hash: string;
  createdAt: string;
  card: EvidenceCard;
}

const memoryStore: StoredEvidenceRecord[] = [];

/**
 * Save an EvidenceCard to Google Cloud Firestore (or memory fallback).
 */
export async function saveEvidenceToFirestore(card: EvidenceCard): Promise<StoredEvidenceRecord> {
  const hash = computeCardHash(card);
  const record: StoredEvidenceRecord = {
    id: `ev-${Date.now()}-${hash.substring(0, 8)}`,
    hash,
    createdAt: new Date().toISOString(),
    card,
  };

  const db = getFirestore();
  if (db) {
    try {
      await db.collection('trustgate_evidence_cards').doc(record.id).set({
        ...record,
        taskId: card.taskId,
        intent: card.intent,
        status: card.status,
        verified: card.verification.verified,
        blockedCount: card.violationsBlocked.length,
      });
      console.log(`🔒 Evidence Card [${record.id}] persisted to Firestore (SHA-256: ${hash.substring(0, 16)}...)`);
    } catch (err: any) {
      console.warn(`⚠️ Failed writing to Firestore: ${err.message}. Stored in local fallback.`);
      memoryStore.unshift(record);
    }
  } else {
    memoryStore.unshift(record);
  }

  return record;
}

/**
 * Query recent Evidence Cards from Google Cloud Firestore.
 */
export async function listEvidenceFromFirestore(limit = 10): Promise<StoredEvidenceRecord[]> {
  const db = getFirestore();
  if (db) {
    try {
      const snapshot = await db
        .collection('trustgate_evidence_cards')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      if (!snapshot.empty) {
        return snapshot.docs.map(doc => doc.data() as StoredEvidenceRecord);
      }
    } catch (err: any) {
      console.warn(`⚠️ Failed querying Firestore: ${err.message}. Reading from local store.`);
    }
  }
  return memoryStore.slice(0, limit);
}
