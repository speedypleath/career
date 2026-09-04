import { createHash } from "node:crypto"
import { query } from "./db.ts"
import {
  MAX_MODEL_INPUT_TOKENS,
  SYSTEM_PROMPT,
  buildModelPrompt,
  estimateTokens,
  type ClassifyInput,
} from "./email-classifier.ts"

export const EMAIL_CLASSIFICATION_QUEUE = "email_classification_jobs"
export const MAX_QUEUED_CLASSIFICATIONS_PER_SCAN = 12

export interface EmailClassificationJob {
  version: 1
  emailLogId: string
  messageId: string
  applicationId: string | null
  sender: string
  subject: string
  company: string
  role: string
  snippet: string
  prompt: string
  promptHash: string
  estimatedInputTokens: number
}

export function buildClassificationJob(
  email: ClassifyInput,
  metadata: Omit<EmailClassificationJob, "version" | "prompt" | "promptHash" | "estimatedInputTokens">,
): EmailClassificationJob {
  const prompt = buildModelPrompt(email)
  const estimatedInputTokens = estimateTokens(`${SYSTEM_PROMPT}\n${prompt}`)
  if (estimatedInputTokens > MAX_MODEL_INPUT_TOKENS) {
    throw new Error(`Classifier prompt exceeds ${MAX_MODEL_INPUT_TOKENS} tokens`)
  }

  return {
    version: 1,
    ...metadata,
    prompt,
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    estimatedInputTokens,
  }
}

export async function enqueueClassificationJob(job: EmailClassificationJob): Promise<string> {
  const queued = await query<{ msg_id: string }>(
    `SELECT pgmq.send($1, $2::jsonb)::text AS msg_id`,
    [EMAIL_CLASSIFICATION_QUEUE, JSON.stringify(job)],
  )
  return queued.rows[0].msg_id
}
