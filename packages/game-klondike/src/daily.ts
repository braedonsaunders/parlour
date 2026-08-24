const PREFIX = 'parlour:klondike:v1:';

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isDailyKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Stable signed 32-bit FNV-1a seed for an app-supplied UTC `YYYY-MM-DD` key. */
export function dailySeed(key: string): number {
  if (!isDailyKey(key))
    throw new RangeError('daily key must be a real UTC date in YYYY-MM-DD form');
  let hash = 0x811c9dc5;
  const input = `${PREFIX}${key}`;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
