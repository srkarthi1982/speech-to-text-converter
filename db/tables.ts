/**
 * Speech-to-Text Converter - transcribe audio into text.
 *
 * Design goals:
 * - Track STT jobs with audio references and transcript.
 * - Keep per-segment breakdown ready for future UI (word highlighting).
 */

import { defineTable, column, NOW } from "astro:db";

export const SttJobs = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    inputAudioUrl: column.text(),                      // source audio file
    audioFormat: column.text({ optional: true }),      // "mp3", "wav", etc.

    language: column.text({ optional: true }),         // detected or target language
    modelName: column.text({ optional: true }),        // STT model identifier

    transcriptText: column.text({ optional: true }),   // full combined transcript
    durationSeconds: column.number({ optional: true }),
    wordCount: column.number({ optional: true }),

    status: column.text({ optional: true }),           // "queued", "processing", "completed", "failed"
    errorMessage: column.text({ optional: true }),

    createdAt: column.date({ default: NOW }),
    completedAt: column.date({ optional: true }),
  },
});

export const SttSegments = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    jobId: column.text({
      references: () => SttJobs.columns.id,
    }),
    orderIndex: column.number(),                       // 1, 2, 3...

    startTimeSeconds: column.number({ optional: true }),
    endTimeSeconds: column.number({ optional: true }),

    text: column.text(),                               // segment text
    speakerLabel: column.text({ optional: true }),     // "Speaker 1" etc., if diarization exists
    confidence: column.number({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  SttJobs,
  SttSegments,
} as const;
