
'use server';

import { firestoreAdmin } from '@/lib/firebaseAdmin';
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';
import { FieldValue } from 'firebase-admin/firestore'; // Import FieldValue

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
    feedback: string | null;
    comparisonResult: CorrectionToken[] | null;
  }>;
}

const MAX_SAVED_MEDIA_ITEMS = 5;
const MAX_MEDIA_DURATION_MINUTES_FOR_SAVE = 10;

export async function saveMediaItemAction(
  args: SaveMediaItemArgs
): Promise<{ success: boolean; message: string; mediaId?: string }> {
  if (!firestoreAdmin) {
    console.error('Firestore Admin is not initialized. Cannot save media item.');
    return { success: false, message: 'Server error: Database connection failed.' };
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
      savedAt: FieldValue.serverTimestamp(), // Use imported FieldValue
    });

    return { success: true, message: 'Media item saved successfully!', mediaId: newMediaItemRef.id };
  } catch (error) { // Added missing opening curly brace
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
