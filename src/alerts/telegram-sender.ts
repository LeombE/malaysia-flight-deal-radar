import type { TelegramConfig } from "../config/telegram.ts";
import { isTelegramConfigured } from "../config/telegram.ts";
import type { TelegramSendResult } from "./types.ts";

export interface TelegramSenderOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  logger?: { log(event: string, fields: Record<string, unknown>): void };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function sanitizedError(status: number): { errorCode: string; errorMessage: string } {
  return {
    errorCode: `telegram_http_${status}`,
    errorMessage: `Telegram sendMessage failed with HTTP ${status}`
  };
}

function logFailure(
  logger: { log(event: string, fields: Record<string, unknown>): void } | undefined,
  failure: TelegramSendResult
): void {
  logger?.log("telegram_send_failed", {
    errorCode: failure.errorCode,
    errorMessage: failure.errorMessage
  });
}

export class TelegramSender {
  private readonly config: TelegramConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: { log(event: string, fields: Record<string, unknown>): void } | undefined;

  constructor(
    config: TelegramConfig,
    options: TelegramSenderOptions = {}
  ) {
    this.config = config;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.logger = options.logger;
  }

  async sendMessage(text: string): Promise<TelegramSendResult> {
    if (!isTelegramConfigured(this.config)) {
      return { status: "disabled", errorCode: "telegram_not_configured", errorMessage: "Telegram config is missing" };
    }
    if (this.config.dryRun) {
      return { status: "sent", dryRun: true };
    }

    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    const body = JSON.stringify({
      chat_id: this.config.chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true
    });

    let lastFailure: TelegramSendResult = { status: "failed", errorCode: "telegram_unknown", errorMessage: "Telegram send failed" };
    for (let attempt = 1; attempt <= this.config.maxRetryAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeout);
        }

        if (response.ok) {
          const payload = await response.json() as { result?: { message_id?: number } };
          const sent: TelegramSendResult = { status: "sent" };
          if (payload.result?.message_id !== undefined) {
            sent.messageId = payload.result.message_id;
          }
          return sent;
        }

        lastFailure = { status: "failed", ...sanitizedError(response.status) };
        if (!isTransient(response.status) || attempt >= this.config.maxRetryAttempts) {
          logFailure(this.logger, lastFailure);
          return lastFailure;
        }
      } catch {
        lastFailure = {
          status: "failed",
          errorCode: "telegram_network_error",
          errorMessage: "Telegram sendMessage network error"
        };
        if (attempt >= this.config.maxRetryAttempts) {
          logFailure(this.logger, lastFailure);
          return lastFailure;
        }
      }
      await this.sleep(Math.min(2_000, this.config.retryBaseDelayMs * 2 ** (attempt - 1)));
    }

    this.logger?.log("telegram_send_failed", {
      errorCode: lastFailure.errorCode,
      errorMessage: lastFailure.errorMessage
    });
    return lastFailure;
  }
}
