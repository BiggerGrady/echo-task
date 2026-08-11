export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024; // 32MB
export const WORD_TEXT_LIMIT = 24_000;
export const EXCEL_SNAPSHOT_JSON_LIMIT = 30_000;
export const CHAT_HISTORY_MESSAGE_LIMIT = 20;

export function getAccessPassword(): string {
  return (
    process.env.ECHO_ACCESS_PASSWORD?.trim() ||
    process.env.ACCESS_PASSWORD?.trim() ||
    ""
  );
}
