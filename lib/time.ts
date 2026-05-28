// lib/time.ts
const TZ_JST = "Asia/Tokyo" as const;

/**
 * ISO文字列 or Date を JST 表示用に Date にする（表示はformatterで行う）
 */
function toDate(input: string | Date) {
  return input instanceof Date ? input : new Date(input);
}

/**
 * よく使うJSTフォーマットを Intl.DateTimeFormat で固定化（高速＆環境差が出ない）
 * timeZone を指定しないと実行環境依存になるため、必ず Asia/Tokyo を指定する。[2](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)[1](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString)
 */
const fmtJstDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ_JST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const fmtJstDateTimeSec = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ_JST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const fmtJstMonthDayTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ_JST,
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const fmtJstTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ_JST,
  hour: "2-digit",
  minute: "2-digit",
});

/** 例: 2026/05/28 13:05（JST固定） */
export function formatJst(input: string | Date) {
  return fmtJstDateTime.format(toDate(input));
}

/** 例: 2026/05/28 13:05:09（JST固定・秒あり） */
export function formatJstSec(input: string | Date) {
  return fmtJstDateTimeSec.format(toDate(input));
}

/** 例: 05/28(水) 13:05（JST固定・開始表示向け） */
export function formatJstStartLabel(input: string | Date) {
  return fmtJstMonthDayTime.format(toDate(input));
}

/** 例: 13:05（JST固定・時刻だけ） */
export function formatJstTime(input: string | Date) {
  return fmtJstTime.format(toDate(input));
}

/**
 * “◯分前” 的な相対表示（JSTに依存せず、timestamp差分で計算するので安全）
 * ※ created_at はUTCでも差分は同じ瞬間を指すため問題なし
 */
export function timeAgoFromNow(input: string | Date) {
  const t = toDate(input).getTime();
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}