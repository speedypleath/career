import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  classifyWithCloudflare,
  type CloudflareClassification,
} from "../_shared/cloudflare-classifier.ts"

interface QueueMessage {
  msg_id: number
  read_ct: number
  message: {
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
}

async function deleteJob(supabase: any, jobId: number) {
  const { error } = await supabase.rpc("delete_email_classification_job", { job_id: jobId })
  if (error) throw error
}

async function archiveJob(supabase: any, jobId: number) {
  const { error } = await supabase.rpc("archive_email_classification_job", { job_id: jobId })
  if (error) throw error
}

async function finalize(
  supabase: any,
  payload: QueueMessage["message"],
  classification: CloudflareClassification,
  source: "cloudflare" | "cache",
  promptTokens: number | null,
  completionTokens: number | null,
) {
  const { error } = await supabase.rpc("finalize_email_classification", {
    payload,
    resolved_classification: classification,
    resolved_source: source,
    prompt_token_count: promptTokens,
    completion_token_count: completionTokens,
  })
  if (error) throw error
}

async function processMessage(
  supabase: any,
  job: QueueMessage,
  cloudflareAccountId: string,
  cloudflareApiToken: string,
) {
  const payload = job.message
  if (payload.version !== 1 || !payload.emailLogId || !payload.prompt || !payload.promptHash) {
    throw new Error("Invalid email-classification queue payload")
  }

  const { data: existingLog, error: logError } = await supabase
    .from("email_logs")
    .select("manual_override, classification_state")
    .eq("id", payload.emailLogId)
    .maybeSingle()
  if (logError) throw logError
  if (!existingLog || existingLog.manual_override || existingLog.classification_state === "resolved") {
    await deleteJob(supabase, job.msg_id)
    return "skipped" as const
  }

  const { data: cached, error: cacheError } = await supabase
    .from("email_classification_cache")
    .select("classification, prompt_tokens, completion_tokens")
    .eq("prompt_hash", payload.promptHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  if (cacheError) throw cacheError

  let classification: CloudflareClassification
  let source: "cloudflare" | "cache"
  let promptTokens: number | null
  let completionTokens: number | null

  if (cached) {
    classification = cached.classification as CloudflareClassification
    source = "cache"
    promptTokens = cached.prompt_tokens
    completionTokens = cached.completion_tokens
  } else {
    const result = await classifyWithCloudflare(payload.prompt, {
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
    })
    classification = result.classification
    source = "cloudflare"
    promptTokens = result.promptTokens
    completionTokens = result.completionTokens

    const { error: upsertError } = await supabase
      .from("email_classification_cache")
      .upsert({
        prompt_hash: payload.promptHash,
        classification,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
    if (upsertError) throw upsertError
  }

  await finalize(supabase, payload, classification, source, promptTokens, completionTokens)
  await deleteJob(supabase, job.msg_id)
  return source
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || ""
  const cloudflareAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim() || ""
  const cloudflareApiToken = Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() || ""

  if (!supabaseUrl || !serviceRoleKey || !cloudflareAccountId || !cloudflareApiToken) {
    return Response.json({
      error: "Worker configuration is incomplete",
      hasUrl: Boolean(supabaseUrl),
      hasKey: Boolean(serviceRoleKey),
      hasAccount: Boolean(cloudflareAccountId),
      hasToken: Boolean(cloudflareApiToken),
    }, { status: 503 })
  }


  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc("read_email_classification_jobs", { batch_size: 5 })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const messages = (data || []) as QueueMessage[]
  const summary = { read: messages.length, completed: 0, cached: 0, retried: 0, archived: 0 }

  for (const message of messages) {
    try {
      const result = await processMessage(supabase, message, cloudflareAccountId, cloudflareApiToken)
      if (result === "cache") summary.cached++
      summary.completed++
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 500) : "Unknown classification error"
      await supabase
        .from("email_logs")
        .update({ classification_error: reason, classification_state: message.read_ct >= 3 ? "failed" : "pending" })
        .eq("id", message.message.emailLogId)

      if (message.read_ct >= 3) {
        await archiveJob(supabase, message.msg_id)
        summary.archived++
      } else {
        summary.retried++
      }
    }
  }

  return Response.json(summary)
})
