import type { ActionAPIContext } from "astro:actions";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { and, asc, db, desc, eq, SttJobs, SttSegments } from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

export const server = {
  createSttJob: defineAction({
    input: z.object({
      inputAudioUrl: z.string().url(),
      audioFormat: z.string().optional(),
      language: z.string().optional(),
      modelName: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const jobId = crypto.randomUUID();

      await db.insert(SttJobs).values({
        id: jobId,
        userId: user.id,
        inputAudioUrl: input.inputAudioUrl,
        audioFormat: input.audioFormat,
        language: input.language,
        modelName: input.modelName,
        status: "queued",
      });

      return {
        success: true,
        data: { id: jobId },
      };
    },
  }),

  updateSttJob: defineAction({
    input: z.object({
      id: z.string(),
      status: z.enum(["queued", "processing", "completed", "failed"]).optional(),
      transcriptText: z.string().optional(),
      errorMessage: z.string().optional(),
      durationSeconds: z.number().nonnegative().optional(),
      wordCount: z.number().int().nonnegative().optional(),
      completedAt: z.date().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const job = await db
        .select()
        .from(SttJobs)
        .where(and(eq(SttJobs.id, input.id), eq(SttJobs.userId, user.id)))
        .get();

      if (!job) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Speech-to-text job not found.",
        });
      }

      const fieldsToUpdate = {
        status: input.status ?? job.status,
        transcriptText: input.transcriptText ?? job.transcriptText,
        errorMessage: input.errorMessage ?? job.errorMessage,
        durationSeconds: input.durationSeconds ?? job.durationSeconds,
        wordCount: input.wordCount ?? job.wordCount,
        completedAt: input.completedAt ?? job.completedAt,
      } as const;

      await db
        .update(SttJobs)
        .set(fieldsToUpdate)
        .where(eq(SttJobs.id, job.id));

      return {
        success: true,
        data: { id: job.id },
      };
    },
  }),

  addSttSegments: defineAction({
    input: z.object({
      jobId: z.string(),
      segments: z
        .array(
          z.object({
            orderIndex: z.number().int().positive(),
            text: z.string().min(1),
            startTimeSeconds: z.number().nonnegative().optional(),
            endTimeSeconds: z.number().nonnegative().optional(),
            speakerLabel: z.string().optional(),
            confidence: z.number().min(0).max(1).optional(),
          })
        )
        .min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const job = await db
        .select()
        .from(SttJobs)
        .where(and(eq(SttJobs.id, input.jobId), eq(SttJobs.userId, user.id)))
        .get();

      if (!job) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Speech-to-text job not found.",
        });
      }

      const values = input.segments.map((segment) => ({
        id: crypto.randomUUID(),
        jobId: input.jobId,
        orderIndex: segment.orderIndex,
        text: segment.text,
        startTimeSeconds: segment.startTimeSeconds,
        endTimeSeconds: segment.endTimeSeconds,
        speakerLabel: segment.speakerLabel,
        confidence: segment.confidence,
      }));

      await db.insert(SttSegments).values(values);

      return {
        success: true,
        data: { inserted: values.length },
      };
    },
  }),

  getSttJobWithSegments: defineAction({
    input: z.object({
      id: z.string(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const job = await db
        .select()
        .from(SttJobs)
        .where(and(eq(SttJobs.id, input.id), eq(SttJobs.userId, user.id)))
        .get();

      if (!job) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Speech-to-text job not found.",
        });
      }

      const segments = await db
        .select()
        .from(SttSegments)
        .where(eq(SttSegments.jobId, job.id))
        .orderBy(asc(SttSegments.orderIndex))
        .all();

      return {
        success: true,
        data: { job, segments },
      };
    },
  }),

  listMySttJobs: defineAction({
    input: z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const offset = (input.page - 1) * input.pageSize;

      const items = await db
        .select()
        .from(SttJobs)
        .where(eq(SttJobs.userId, user.id))
        .orderBy(desc(SttJobs.createdAt))
        .limit(input.pageSize)
        .offset(offset)
        .all();

      return {
        success: true,
        data: {
          items,
          total: items.length,
        },
      };
    },
  }),
};
