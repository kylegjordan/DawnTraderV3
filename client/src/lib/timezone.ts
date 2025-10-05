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

export function getCurrentDateUTC(): string {
  return dayjs().utc().format('DD MMM YYYY');
}

export function getCurrentTimeLocal(timezone: string, timeFormat: '12hr' | '24hr'): string {
  const format = timeFormat === '12hr' ? 'h:mm:ss A' : 'HH:mm:ss';
  return dayjs().tz(timezone).format(format);
}

export function getCurrentDateLocal(timezone: string): string {
  return dayjs().tz(timezone).format('DD MMM YYYY');
}

export function formatUTCTimeWithDate(timeFormat: '12hr' | '24hr'): string {
  const format = timeFormat === '12hr' ? 'h:mm A' : 'HH:mm';
  const time = dayjs().utc().format(format);
  const date = dayjs().utc().format('MMM D, YYYY');
  return `${time} — ${date}`;
}

export function formatLocalTimeWithDate(timezone: string, timeFormat: '12hr' | '24hr'): string {
  const format = timeFormat === '12hr' ? 'h:mm A' : 'HH:mm';
  const time = dayjs().tz(timezone).format(format);
  const date = dayjs().tz(timezone).format('MMM D, YYYY');
  return `${time} — ${date}`;
}

export function getTimezoneAbbr(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find(part => part.type === 'timeZoneName');
    return tzPart?.value || timezone.split('/').pop() || 'Local';
  } catch (error) {
    // Fallback to last part of timezone string
    return timezone.split('/').pop() || 'Local';
  }
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

// Comprehensive timezone list organized by region
export const timezones = [
  // Americas
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Anchorage', label: 'Anchorage (AKST/AKDT)' },
  { value: 'Pacific/Honolulu', label: 'Honolulu (HST)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'America/Santiago', label: 'Santiago' },
  { value: 'America/Lima', label: 'Lima' },
  { value: 'America/Bogota', label: 'Bogotá' },
  { value: 'America/Caracas', label: 'Caracas' },
  
  // Europe
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Brussels', label: 'Brussels (CET/CEST)' },
  { value: 'Europe/Vienna', label: 'Vienna (CET/CEST)' },
  { value: 'Europe/Warsaw', label: 'Warsaw / Mikolajki Pomorskie, Poland (CET/CEST)' },
  { value: 'Europe/Prague', label: 'Prague (CET/CEST)' },
  { value: 'Europe/Budapest', label: 'Budapest (CET/CEST)' },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET/CEST)' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen (CET/CEST)' },
  { value: 'Europe/Oslo', label: 'Oslo (CET/CEST)' },
  { value: 'Europe/Helsinki', label: 'Helsinki (EET/EEST)' },
  { value: 'Europe/Athens', label: 'Athens (EET/EEST)' },
  { value: 'Europe/Bucharest', label: 'Bucharest (EET/EEST)' },
  { value: 'Europe/Sofia', label: 'Sofia (EET/EEST)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
  { value: 'Europe/Kiev', label: 'Kyiv (EET/EEST)' },
  { value: 'Europe/Zurich', label: 'Zurich (CET/CEST)' },
  { value: 'Europe/Lisbon', label: 'Lisbon (WET/WEST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  
  // Middle East
  { value: 'Asia/Dubai', label: 'Dubai / Abu Dhabi, UAE (GST)' },
  { value: 'Asia/Riyadh', label: 'Riyadh (AST)' },
  { value: 'Asia/Kuwait', label: 'Kuwait (AST)' },
  { value: 'Asia/Qatar', label: 'Doha, Qatar (AST)' },
  { value: 'Asia/Bahrain', label: 'Manama, Bahrain (AST)' },
  { value: 'Asia/Muscat', label: 'Muscat, Oman (GST)' },
  { value: 'Asia/Tehran', label: 'Tehran (IRST/IRDT)' },
  { value: 'Asia/Baghdad', label: 'Baghdad (AST)' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem (IST/IDT)' },
  { value: 'Asia/Beirut', label: 'Beirut (EET/EEST)' },
  { value: 'Asia/Damascus', label: 'Damascus (EET/EEST)' },
  
  // Asia
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Taipei', label: 'Taipei (CST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
  { value: 'Asia/Jakarta', label: 'Jakarta (WIB)' },
  { value: 'Asia/Manila', label: 'Manila (PHT)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur (MYT)' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City (ICT)' },
  { value: 'Asia/Karachi', label: 'Karachi (PKT)' },
  { value: 'Asia/Kolkata', label: 'Mumbai / Delhi, India (IST)' },
  { value: 'Asia/Dhaka', label: 'Dhaka (BST)' },
  { value: 'Asia/Colombo', label: 'Colombo (IST)' },
  { value: 'Asia/Kathmandu', label: 'Kathmandu (NPT)' },
  { value: 'Asia/Tashkent', label: 'Tashkent (UZT)' },
  { value: 'Asia/Almaty', label: 'Almaty (ALMT)' },
  { value: 'Asia/Yekaterinburg', label: 'Yekaterinburg (YEKT)' },
  { value: 'Asia/Novosibirsk', label: 'Novosibirsk (NOVT)' },
  { value: 'Asia/Vladivostok', label: 'Vladivostok (VLAT)' },
  
  // Oceania
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEDT/AEST)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACDT/ACST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZDT/NZST)' },
  { value: 'Pacific/Fiji', label: 'Fiji (FJT)' },
  
  // Africa
  { value: 'Africa/Cairo', label: 'Cairo (EET)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { value: 'Africa/Lagos', label: 'Lagos (WAT)' },
  { value: 'Africa/Nairobi', label: 'Nairobi (EAT)' },
  { value: 'Africa/Casablanca', label: 'Casablanca (WET/WEST)' },
  { value: 'Africa/Algiers', label: 'Algiers (CET)' },
  { value: 'Africa/Tunis', label: 'Tunis (CET)' },
];
