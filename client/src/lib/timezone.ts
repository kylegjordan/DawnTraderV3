import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface TimezoneSettings {
  timezone: string;
  timeFormat: '12hr' | '24hr';
}

export function formatTimestamp(
  utcTimestamp: string | Date,
  settings: TimezoneSettings
): string {
  const format = settings.timeFormat === '12hr' 
    ? 'MMM D, YYYY h:mm:ss A' 
    : 'MMM D, YYYY HH:mm:ss';
  
  return dayjs(utcTimestamp)
    .utc()
    .tz(settings.timezone)
    .format(format);
}

export function formatTime(
  utcTimestamp: string | Date,
  settings: TimezoneSettings
): string {
  const format = settings.timeFormat === '12hr' 
    ? 'h:mm:ss A' 
    : 'HH:mm:ss';
  
  return dayjs(utcTimestamp)
    .utc()
    .tz(settings.timezone)
    .format(format);
}

export function formatDate(
  utcTimestamp: string | Date,
  settings: TimezoneSettings
): string {
  return dayjs(utcTimestamp)
    .utc()
    .tz(settings.timezone)
    .format('MMM D, YYYY');
}

export function getCurrentTimeUTC(): string {
  return dayjs().utc().format('HH:mm:ss');
}

export function getCurrentTimeLocal(timezone: string, timeFormat: '12hr' | '24hr'): string {
  const format = timeFormat === '12hr' ? 'h:mm:ss A' : 'HH:mm:ss';
  return dayjs().tz(timezone).format(format);
}

export function getTimezoneAbbr(timezone: string): string {
  return dayjs().tz(timezone).format('z');
}

export function formatTimestampWithTZ(
  utcTimestamp: string | Date,
  timezone: string,
  timeFormat: '12hr' | '24hr'
): string {
  const format = timeFormat === '12hr' 
    ? 'MMM D, YYYY h:mm:ss A z' 
    : 'MMM D, YYYY HH:mm:ss z';
  
  return dayjs(utcTimestamp)
    .utc()
    .tz(timezone)
    .format(format);
}
