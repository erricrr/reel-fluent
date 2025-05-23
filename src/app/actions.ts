
'use server';

import { firestoreAdmin } from '@/lib/firebaseAdmin';
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';
// import { FieldValue } from 'firebase-admin/firestore'; // TEMPORARILY COMMENTED OUT to resolve module loading issues. Re-enable when firebase-admin is correctly installed.

interface SaveMediaItemArgs {
  userId: string;
  mediaUrl: string;
  mediaDisplayName: string;
  mediaDuration: number;
  mediaType: 'video' | 'audio' | 'url' | 'unknown';
  language: string;
  clipSegmentationDuration: number;
  clips: Array<{
    id: string;
    startTime: number;
    endTime: number;
    userTranscription: string | null;
    automatedTranscription: string | null;
    feedback: string | null; // Old feedback field, potentially for removal later
    englishTranslation: string | null; // New translation field
    comparisonResult: CorrectionToken[] | null;
  }>;
}

const MAX_SAVED_MEDIA_ITEMS = 5;
const MAX_MEDIA_DURATION_MINUTES_FOR_SAVE = 10;

export async function saveMediaItemAction(
  args: SaveMediaItemArgs
): Promise<{ success: boolean; message: string; mediaId?: string }> {
  if (!firestoreAdmin) {
    console.warn('Firestore Admin is not initialized. Cannot save media item. Firebase might be disabled or not configured.');
    return { success: false, message: 'Server error: Database connection failed or not configured.' };
  }

  if (args.mediaType !== 'url' && args.mediaDuration > MAX_MEDIA_DURATION_MINUTES_FOR_SAVE * 60) {
     return { success: false, message: `Cannot save. Media duration exceeds the ${MAX_MEDIA_DURATION_MINUTES_FOR_SAVE}-minute limit.` };
  }

  try {
    const userMediaCollection = firestoreAdmin
      .collection('users')
      .doc(args.userId)
      .collection('mediaItems');

    const snapshot = await userMediaCollection.count().get();
    const currentCount = snapshot.data().count;

    if (currentCount >= MAX_SAVED_MEDIA_ITEMS) {
      return {
        success: false,
        message: `Cannot save. You have reached the maximum of ${MAX_SAVED_MEDIA_ITEMS} saved media items. Please delete an existing item to save a new one.`,
      };
    }

    const newMediaItemRef = userMediaCollection.doc();
    await newMediaItemRef.set({
      mediaUrl: args.mediaUrl,
      mediaDisplayName: args.mediaDisplayName,
      mediaDuration: args.mediaDuration,
      mediaType: args.mediaType,
      language: args.language,
      clipSegmentationDuration: args.clipSegmentationDuration,
      clips: args.clips,
      // TEMPORARY CHANGE: Using ISOString due to module resolution issues with FieldValue.
      // Revert to FieldValue.serverTimestamp() when firebase-admin is correctly installed and Firebase is enabled.
      savedAt: new Date().toISOString(), 
      // savedAt: FieldValue.serverTimestamp(), // Original code using Firestore server timestamp
    });

    return { success: true, message: 'Media item saved successfully!', mediaId: newMediaItemRef.id };
  } catch (error) {
    console.error('Error saving media item to Firestore:', error);
    let errorMessage = 'Failed to save media item due to a server error.';
    if (error instanceof Error) {
        errorMessage = `Failed to save media item: ${error.message}`;
    }
    return { success: false, message: errorMessage };
  }
}

// Placeholder for deleting a media item - to be implemented
// export async function deleteMediaItemAction(userId: string, mediaId: string): Promise<{ success: boolean; message: string }> {
//   // ...
// }

// Placeholder for fetching user's media items - to be implemented
// export async function getUserMediaItemsAction(userId: string): Promise<any[]> {
//   // ...
// }
