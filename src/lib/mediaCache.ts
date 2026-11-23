import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { MediaDoc, MediaMimeType } from '../types/zynko';
import { db, handleFirestoreError, OperationType } from './firebase';

const mediaCache = new Map<string, MediaDoc | null>();
const inflightRequests = new Map<string, Promise<MediaDoc | null>>();

export async function getMediaById(mediaId: string): Promise<MediaDoc | null> {
  if (!mediaId) return null;
  if (mediaCache.has(mediaId)) {
    return mediaCache.get(mediaId) ?? null;
  }
  const existingPromise = inflightRequests.get(mediaId);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'media', mediaId));
      if (!snap.exists()) {
        mediaCache.set(mediaId, null);
        return null;
      }
      const data = snap.data();
      const item: MediaDoc = {
        id: snap.id,
        ownerId: String(data.ownerId || ''),
        mimeType: (data.mimeType as MediaMimeType) || 'image/jpeg',
        dataBase64: String(data.dataBase64 || ''),
        createdAt: data.createdAt,
      };
      mediaCache.set(mediaId, item);
      return item;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `media/${mediaId}`, true);
      return null;
    } finally {
      inflightRequests.delete(mediaId);
    }
  })();

  inflightRequests.set(mediaId, promise);
  return promise;
}

export async function uploadMediaToFirestore(
  ownerId: string,
  mimeType: MediaMimeType,
  dataBase64: string
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'media'), {
      ownerId,
      mimeType,
      dataBase64,
      createdAt: serverTimestamp(),
    });
    mediaCache.set(docRef.id, {
      id: docRef.id,
      ownerId,
      mimeType,
      dataBase64,
      createdAt: Date.now(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'media');
    throw error;
  }
}

export function primeMediaCache(mediaId: string, media: MediaDoc) {
  mediaCache.set(mediaId, media);
}
