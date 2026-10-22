/**
 * File de retry pour l'envoi des notifications push (Phase 3).
 * Objectif : ne JAMAIS perdre un push — on réessaie avec backoff exponentiel
 * jusqu'à N tentatives ; au-delà, l'échec est loggé (la notif in-app reste
 * persistée en base, c'est la source de vérité).
 *
 * Implémentation en mémoire (single instance) — suffisant pour le déploiement
 * actuel ; remplacer par une queue durable (BullMQ/pg-boss) en multi-instances.
 */

interface RetryJob {
  id: string;
  attempt: number;
  maxAttempts: number;
  nextRunAt: number;
  run: () => Promise<void>;
  label: string;
}

const queue: RetryJob[] = [];
let timer: NodeJS.Timeout | null = null;

const BASE_DELAY_MS = 5_000;        // 5 s, 10 s, 20 s, 40 s…
const MAX_ATTEMPTS = 5;

function scheduleTick(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void drain();
  }, 1_000);
  timer.unref?.();
}

async function drain(): Promise<void> {
  const now = Date.now();
  const due = queue.filter((j) => j.nextRunAt <= now);
  for (const job of due) {
    const idx = queue.indexOf(job);
    if (idx >= 0) queue.splice(idx, 1);
    try {
      await job.run();
    } catch (e) {
      job.attempt += 1;
      if (job.attempt >= job.maxAttempts) {
        console.error(`[notify-retry] abandon après ${job.attempt} essais : ${job.label}`, e);
        continue;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, job.attempt - 1);
      job.nextRunAt = Date.now() + delay;
      queue.push(job);
      console.warn(`[notify-retry] échec (${job.attempt}/${job.maxAttempts}) — nouvel essai dans ${delay} ms : ${job.label}`);
    }
  }
  if (queue.length > 0) scheduleTick();
}

/** Enfile un envoi avec retries. Retourne le job id. */
export function enqueueNotificationSend(label: string, run: () => Promise<void>): string {
  const job: RetryJob = {
    id: `nj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    attempt: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRunAt: Date.now(),
    run,
    label,
    };
  queue.push(job);
  scheduleTick();
  return job.id;
}

/** Taille de la file (monitoring/centre de sync). */
export function pendingNotificationJobs(): number {
  return queue.length;
}
