import { format, isSameDay, isToday } from 'date-fns';

function parseChatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getChatDayKey(value: string) {
  const date = parseChatDate(value);
  return date ? format(date, 'yyyy-MM-dd') : value;
}

export function isChatDateToday(value: string) {
  const date = parseChatDate(value);
  return date ? isToday(date) : false;
}

export function isSameChatDay(currentValue: string, previousValue: string) {
  const currentDate = parseChatDate(currentValue);
  const previousDate = parseChatDate(previousValue);

  if (!currentDate || !previousDate) {
    return getChatDayKey(currentValue) === getChatDayKey(previousValue);
  }

  return isSameDay(currentDate, previousDate);
}

export function formatChatListDate(value: string) {
  const date = parseChatDate(value);

  if (!date) {
    return '';
  }

  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM yyyy');
}

export function formatMessageTimestamp(value: string) {
  const date = parseChatDate(value);

  if (!date) {
    return '';
  }

  return isToday(date)
    ? format(date, 'HH:mm')
    : format(date, 'd MMM yyyy, HH:mm');
}

export function formatMessageDateDivider(value: string) {
  const date = parseChatDate(value);

  if (!date) {
    return '';
  }

  return isToday(date) ? 'Today' : format(date, 'd MMM yyyy');
}

export function formatChatDateRange(values: string[]) {
  const dates = values
    .map(parseChatDate)
    .filter((date): date is Date => date !== null);

  if (dates.length === 0 || dates.every((date) => isToday(date))) {
    return '';
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (isSameDay(firstDate, lastDate)) {
    return formatMessageDateDivider(firstDate.toISOString());
  }

  return `${formatMessageDateDivider(firstDate.toISOString())} - ${formatMessageDateDivider(lastDate.toISOString())}`;
}
