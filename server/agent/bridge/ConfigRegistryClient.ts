export interface ConfigRegistry {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
}

export class ConfigRegistryClient implements ConfigRegistry {
  private store: Map<string, unknown> = new Map();

  get<T>(key: string): T | undefined {
    console.log(`[ConfigRegistry] get(${key}) - stub placeholder`);
    return this.store.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    console.log(`[ConfigRegistry] set(${key}, ${JSON.stringify(value)}) - stub placeholder`);
    this.store.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}
