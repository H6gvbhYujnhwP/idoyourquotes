/**
 * server/templates/migrationDefaults.ts
 *
 * Phase 4A Delivery 29 — re-export shim. Locked default content has
 * relocated to shared/migrationDefaults.ts so the client-side
 * Review-before-Generate modal can read the same content the renderer
 * uses for its third-tier cascade fallback.
 *
 * D28's migrationAppendix.ts continues to import from this path
 * unchanged — `defaultsFor`, `MIGRATION_DEFAULTS`, `DEFAULT_HYPERCARE_DAYS`,
 * `MigrationType`, and `MigrationProfileDefaults` are all re-exported
 * verbatim from the shared module.
 */

export {
  defaultsFor,
  MIGRATION_DEFAULTS,
  DEFAULT_HYPERCARE_DAYS,
  type MigrationType,
  type MigrationProfileDefaults,
} from "../../shared/migrationDefaults";
