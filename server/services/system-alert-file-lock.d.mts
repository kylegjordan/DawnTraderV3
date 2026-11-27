export function withAlertFileLock<T>(ledgerPath: string, fn: () => T | Promise<T>): Promise<T>;
