import { logger } from "../utils/structured-logger";

export class ConfigAuditService {
  static recordChange(key: string, updatedBy: string, oldValue: any, newValue: any): void {
    logger.info("Config change audit", {
      key,
      updatedBy,
      oldValue,
      newValue,
      phase: "6",
      service: "config-audit"
    });
  }

  static recordAccess(key: string, accessedBy: string): void {
    logger.debug("Config accessed", {
      key,
      accessedBy,
      phase: "6",
      service: "config-audit"
    });
  }

  static recordBulkUpdate(keys: string[], updatedBy: string): void {
    logger.info("Config bulk update", {
      keys,
      updatedBy,
      count: keys.length,
      phase: "6",
      service: "config-audit"
    });
  }
}
