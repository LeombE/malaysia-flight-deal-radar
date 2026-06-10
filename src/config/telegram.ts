export interface TelegramConfig {
  botToken: string | undefined;
  chatId: string | undefined;
  alertCooldownHours: number;
  revalidateBeforeAlertMinutes: number;
  dryRun: boolean;
  timeoutMs: number;
  maxRetryAttempts: number;
  retryBaseDelayMs: number;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function parseTelegramConfig(env: Record<string, string | undefined>): TelegramConfig {
  return {
    botToken: env.TELEGRAM_BOT_TOKEN || undefined,
    chatId: env.TELEGRAM_CHAT_ID || undefined,
    alertCooldownHours: parsePositiveInteger(env.ALERT_COOLDOWN_HOURS, 24),
    revalidateBeforeAlertMinutes: parsePositiveInteger(env.REVALIDATE_BEFORE_ALERT_MINUTES, 30),
    dryRun: parseBoolean(env.TELEGRAM_DRY_RUN),
    timeoutMs: parsePositiveInteger(env.TELEGRAM_TIMEOUT_MS, 5_000),
    maxRetryAttempts: parsePositiveInteger(env.TELEGRAM_MAX_RETRY_ATTEMPTS, 3),
    retryBaseDelayMs: parsePositiveInteger(env.TELEGRAM_RETRY_BASE_DELAY_MS, 250)
  };
}

export function isTelegramConfigured(config: TelegramConfig): boolean {
  return Boolean(config.botToken && config.chatId);
}

