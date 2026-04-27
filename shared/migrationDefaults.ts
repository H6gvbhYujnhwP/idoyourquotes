/**
 * shared/migrationDefaults.ts
 *
 * Phase 4A Delivery 25 / 29 — locked default content for the four
 * migration profiles (server / m365 / workspace / tenant). Originally
 * lived at server/templates/migrationDefaults.ts; relocated to /shared
 * in D29 so the Review-before-Generate modal can pre-fill its Edit
 * fields with the same locked content the renderer falls through to.
 *
 * server/templates/migrationDefaults.ts is now a one-line re-export
 * shim of this module — D28's migrationAppendix.ts continues to
 * import from "./migrationDefaults" and gets the same surface as
 * before, with no behaviour change.
 *
 * Six editable blocks per profile:
 *   - methodology      : single paragraph
 *   - phases           : numbered list (one entry per line, "N. Title — items")
 *   - assumptions      : bulleted list (one entry per line, "- text")
 *   - risks            : bulleted list of "Risk: ... Mitigation: ..." pairs
 *   - rollback         : single paragraph; may include {hypercareDays}
 *   - outOfScope       : bulleted list (one entry per line, "- text")
 *
 * The {hypercareDays} placeholder in rollback is substituted by the
 * renderer (Delivery 26) using the cascade
 *   quote.hypercareDays → org.defaultHypercareDays → 14.
 *
 * No I/O, no async, no side effects — pure data.
 */

export type MigrationType = "server" | "m365" | "workspace" | "tenant";

export interface MigrationProfileDefaults {
  /** Narrative paragraph describing the methodology used. */
  methodology: string;
  /**
   * Numbered phase list. Each line is one phase, format
   * "N. Title — sub-item, sub-item, sub-item". Editable as free text by
   * the user; renderer dumps verbatim.
   */
  phases: string;
  /**
   * Bulleted pre-migration assumption list. Each line is one bullet,
   * prefixed with "- ".
   */
  assumptions: string;
  /**
   * Bulleted risk/mitigation pair list. Each pair occupies two lines
   * formatted as "- Risk: ..." then "  Mitigation: ...". Renderer
   * dumps verbatim.
   */
  risks: string;
  /**
   * Rollback narrative paragraph. May include the literal token
   * "{hypercareDays}" which the renderer substitutes with the resolved
   * hypercare-days value.
   */
  rollback: string;
  /** Bulleted out-of-scope list. */
  outOfScope: string;
}

// ── Server migration ─────────────────────────────────────────────────

const SERVER: MigrationProfileDefaults = {
  methodology:
    "We follow a four-phase migration methodology: discovery and design, build and pre-migration validation, cutover, and post-migration support. Each phase has defined entry and exit criteria, and the cutover phase is run during an agreed maintenance window with named technical points of contact on both sides. A full rollback plan is in place from the moment cutover begins until the post-migration sign-off.",
  phases: [
    "1. Discovery & Design — audit of source environment, dependency mapping, target sizing, design sign-off",
    "2. Build & Pre-Migration Validation — provision target environment, replicate non-production data, test application functionality, dry-run the cutover steps",
    "3. Cutover — final data sync, DNS / connection-string switch, go/no-go decision",
    "4. Testing & Handover — functional testing on target environment, user acceptance testing, documentation handover, formal sign-off",
    "5. Post-Migration Support — hypercare period, decommission of source environment subject to client sign-off",
  ].join("\n"),
  assumptions: [
    "- Source servers are in a working, supported state at the point of cutover",
    "- Source server documentation, credentials, and licence keys are available and current",
    "- Network bandwidth between source and target is sufficient for the scheduled cutover window",
    "- All applications running on the source servers are licensed for migration to the target environment",
    "- Backup of the source environment is the client's responsibility unless explicitly listed in the line items",
    "- Third-party vendors (line-of-business application support, ISP, datacentre) are expected to cooperate during the cutover window. Where this cooperation is delayed or unavailable, project timelines may be affected.",
  ].join("\n"),
  risks: [
    "- Risk: unknown dependencies discovered during cutover.",
    "  Mitigation: dependency mapping in the discovery phase plus a parallel-run window before final switchover.",
    "- Risk: application incompatibility on the target environment.",
    "  Mitigation: functional testing of all in-scope applications during the build phase; sign-off required before cutover.",
    "- Risk: data corruption or loss during transfer.",
    "  Mitigation: verified backup of source taken immediately before cutover; checksum validation of transferred data.",
    "- Risk: cutover overruns the maintenance window.",
    "  Mitigation: dry-run executed during build phase to validate timings; defined rollback trigger at the 80% mark of the agreed window.",
    "- Risk: licence transfer blocked by vendor.",
    "  Mitigation: licence position confirmed in writing during discovery phase; any blocking issues escalated before build commences.",
    "- Risk: end-user disruption post-cutover.",
    "  Mitigation: comms plan signed off in discovery; hypercare window covers immediate-aftermath issues.",
  ].join("\n"),
  rollback:
    "In the event of a critical issue during cutover, we will revert to the source environment within the agreed maintenance window. The rollback trigger is a documented \"no-go\" decision agreed by both technical leads at any point during the cutover. Source systems remain online and untouched until post-migration sign-off, which is given no earlier than {hypercareDays} days after successful cutover.",
  outOfScope: [
    "- End-user training on any new applications or interfaces introduced by the target environment",
    "- Application code changes or refactoring required to run on the target environment",
    "- Data cleansing, deduplication, or archival prior to migration",
    "- Procurement or relicensing of any software not explicitly listed in the line items",
    "- Network re-architecture beyond what is required to enable the cutover",
    "- Migration of any system, application, or dataset not listed in the scope above",
  ].join("\n"),
};

// ── Microsoft 365 migration ──────────────────────────────────────────

const M365: MigrationProfileDefaults = {
  methodology:
    "We follow a phased Microsoft 365 migration methodology: tenant assessment and design, tenant build and licensing, mail and data migration in waves, cutover, and post-migration support. Migration is delivered in user waves where possible to limit risk, with each wave validated before the next begins. DNS cutover is scheduled for an agreed maintenance window with named technical contacts on both sides.",
  phases: [
    "1. Tenant Assessment & Design — source environment audit, licensing review, tenant design, security baseline (Conditional Access, MFA), design sign-off",
    "2. Tenant Build & Pre-Migration Setup — provision M365 tenant, apply security baseline, configure mail flow, validate licence assignment, communications plan to end users",
    "3. Pilot Wave Migration — migrate 5–10 pilot users, validate mail flow / OneDrive / Teams / mobile devices, capture lessons learned",
    "4. Production Wave Migration — migrate remaining users in scheduled waves, post-wave validation",
    "5. DNS Cutover & Decommission — final MX record switch, mail flow validation, source environment retention as agreed, source decommission subject to client sign-off",
  ].join("\n"),
  assumptions: [
    "- Source mailbox sizes and user count match the figures provided at quotation; material variance may require requoting",
    "- Microsoft 365 licences will be purchased and assigned to all in-scope users before migration begins",
    "- The client's domain registrar is accessible and DNS records can be modified during the cutover window",
    "- End users will be available to validate their migrated mailboxes within 48 hours of cutover",
    "- Existing mobile devices will be reconfigured by end users following provided instructions; on-site mobile reconfiguration is not included unless explicitly listed",
    "- Multi-factor authentication will be enforced on all migrated accounts as part of the security baseline",
    "- Third-party vendors (line-of-business application support, ISP, datacentre) are expected to cooperate during the cutover window. Where this cooperation is delayed or unavailable, project timelines may be affected.",
  ].join("\n"),
  risks: [
    "- Risk: mailbox size or item count exceeds Microsoft service limits.",
    "  Mitigation: size validation in assessment phase; archival or splitting of oversized mailboxes before migration.",
    "- Risk: mail flow disruption during DNS cutover.",
    "  Mitigation: TTL reduction 48 hours before cutover; coexistence configured to handle in-flight mail during the changeover window.",
    "- Risk: end users cannot access mail post-cutover due to client cache or profile issues.",
    "  Mitigation: user comms plan includes Outlook profile reset instructions; hypercare window covers immediate-aftermath support.",
    "- Risk: licence assignment errors leave users blocked.",
    "  Mitigation: licence validation report run in build phase and re-run immediately before each wave.",
    "- Risk: legacy authentication protocols required by line-of-business apps blocked by security baseline.",
    "  Mitigation: legacy auth dependency audit in assessment phase; exemptions or modern-auth alternatives agreed before baseline applied.",
    "- Risk: mobile device reconfiguration causes end-user disruption.",
    "  Mitigation: pre-cutover comms with step-by-step reconfiguration guides; pilot wave validates the guide before production.",
  ].join("\n"),
  rollback:
    "Rollback for an M365 migration is partial by nature: once mailboxes have been migrated and end users have generated new content in M365, full reversion to the source environment is not practical. Our rollback plan therefore focuses on the cutover event itself — if a critical issue is identified before MX records are switched, the cutover is paused and rescheduled. After MX cutover, recovery is by forward-fix rather than rollback, with the source environment retained read-only for {hypercareDays} days as a reference and recovery point for individual mailboxes.",
  outOfScope: [
    "- End-user training on M365 applications (Outlook, Teams, OneDrive, SharePoint) beyond migration-specific instructions",
    "- Migration of public folders, shared mailboxes over 50GB, or archive mailboxes unless explicitly listed in the line items",
    "- Mobile device management (Intune) configuration unless explicitly listed",
    "- Backup of the M365 tenant post-migration (third-party backup recommended but not included)",
    "- Migration of legacy email archives held outside the source mail system (PST files on user devices, third-party archive products)",
    "- Configuration of integrations between M365 and third-party systems (e.g. CRM, ERP) unless explicitly listed",
    "- Procurement or relicensing of any software not explicitly listed in the line items",
  ].join("\n"),
};

// ── Google Workspace migration ───────────────────────────────────────

const WORKSPACE: MigrationProfileDefaults = {
  methodology:
    "We follow a phased Google Workspace migration methodology: tenant assessment and design, Workspace build and licensing, mail and data migration in waves, cutover, and post-migration support. Migration is delivered in user waves where possible to limit risk, using Google's data migration tooling for mail, calendar, and contacts. DNS cutover is scheduled for an agreed maintenance window with named technical contacts on both sides.",
  phases: [
    "1. Workspace Assessment & Design — source environment audit, licensing review (Business Starter / Standard / Plus / Enterprise), Workspace organisation unit design, security baseline (2-step verification, context-aware access), design sign-off",
    "2. Workspace Build & Pre-Migration Setup — provision Workspace tenant, apply security baseline, configure mail routing, validate licence assignment, communications plan to end users",
    "3. Pilot Wave Migration — migrate 5–10 pilot users using Google Workspace Migrate or third-party tooling, validate Gmail / Drive / Calendar / mobile devices, capture lessons learned",
    "4. Production Wave Migration — migrate remaining users in scheduled waves, post-wave validation, Drive shared-content remap",
    "5. DNS Cutover & Decommission — final MX record switch, mail flow validation, source environment retention as agreed, source decommission subject to client sign-off",
  ].join("\n"),
  assumptions: [
    "- Source mailbox sizes, Drive volumes, and user count match the figures provided at quotation; material variance may require requoting",
    "- Google Workspace licences will be purchased and assigned to all in-scope users before migration begins",
    "- The client's domain registrar is accessible and DNS records can be modified during the cutover window",
    "- End users will be available to validate their migrated mailboxes and Drive content within 48 hours of cutover",
    "- Existing mobile devices will be reconfigured by end users following provided instructions; on-site mobile reconfiguration is not included unless explicitly listed",
    "- 2-step verification will be enforced on all migrated accounts as part of the security baseline",
    "- Third-party vendors (line-of-business application support, ISP, datacentre) are expected to cooperate during the cutover window. Where this cooperation is delayed or unavailable, project timelines may be affected.",
  ].join("\n"),
  risks: [
    "- Risk: mailbox size or Drive volume exceeds Google service limits.",
    "  Mitigation: size validation in assessment phase; archival or splitting of oversized accounts before migration.",
    "- Risk: mail flow disruption during DNS cutover.",
    "  Mitigation: TTL reduction 48 hours before cutover; dual-delivery configured to handle in-flight mail during the changeover window.",
    "- Risk: shared-content permissions break post-migration.",
    "  Mitigation: permission map captured in assessment phase; pilot wave validates remap process before production.",
    "- Risk: legacy IMAP-only or basic-auth applications blocked by security baseline.",
    "  Mitigation: dependency audit in assessment phase; app passwords or modern-auth alternatives agreed before baseline applied.",
    "- Risk: licence assignment errors leave users blocked.",
    "  Mitigation: licence validation report run in build phase and re-run immediately before each wave.",
    "- Risk: end-user disruption from interface change.",
    "  Mitigation: pre-cutover comms with quick-reference guides; pilot wave validates the guide before production.",
  ].join("\n"),
  rollback:
    "Rollback for a Google Workspace migration is partial by nature: once mailboxes and Drive content have been migrated and end users have generated new content in Workspace, full reversion to the source environment is not practical. Our rollback plan therefore focuses on the cutover event itself — if a critical issue is identified before MX records are switched, the cutover is paused and rescheduled. After MX cutover, recovery is by forward-fix rather than rollback, with the source environment retained read-only for {hypercareDays} days as a reference and recovery point for individual accounts.",
  outOfScope: [
    "- End-user training on Google Workspace applications (Gmail, Drive, Calendar, Meet, Chat) beyond migration-specific instructions",
    "- Migration of shared mailboxes, group accounts, or resource calendars unless explicitly listed in the line items",
    "- Endpoint management (Google Endpoint / context-aware access advanced) configuration unless explicitly listed",
    "- Backup of the Workspace tenant post-migration (third-party backup recommended but not included)",
    "- Migration of legacy email archives held outside the source mail system (local PST files, third-party archive products)",
    "- Configuration of integrations between Workspace and third-party systems (e.g. CRM, ERP) unless explicitly listed",
    "- Procurement or relicensing of any software not explicitly listed in the line items",
  ].join("\n"),
};

// ── Tenant / cross-vendor migration ──────────────────────────────────

const TENANT: MigrationProfileDefaults = {
  methodology:
    "We follow a phased tenant migration methodology covering both intra-platform (tenant-to-tenant within Microsoft or within Google) and cross-platform (Workspace to Microsoft, or Microsoft to Workspace) moves: assessment and design, target tenant build, coexistence configuration, mail and data migration in waves, cutover, and post-migration support. Coexistence is critical to limit user disruption during the transition window. DNS cutover is scheduled for an agreed maintenance window with named technical contacts on both sides.",
  phases: [
    "1. Source & Target Assessment — audit of source tenant, identity mapping, licensing review on target, coexistence design, security baseline alignment, design sign-off",
    "2. Target Tenant Build & Coexistence — provision target tenant, apply security baseline, configure coexistence (mail flow, free/busy where supported), validate licence assignment, communications plan to end users",
    "3. Pilot Wave Migration — migrate 5–10 pilot users, validate mail / files / calendar / mobile devices in coexistence, capture lessons learned",
    "4. Production Wave Migration — migrate remaining users in scheduled waves, post-wave validation, content and permission remap",
    "5. DNS Cutover & Source Decommission — final MX record switch, mail flow validation, source tenant retention as agreed, source decommission subject to client sign-off",
  ].join("\n"),
  assumptions: [
    "- Source tenant administrative access is available throughout the engagement, including consented access for migration tooling",
    "- Source mailbox sizes, content volumes, and user count match the figures provided at quotation; material variance may require requoting",
    "- Target tenant licences will be purchased and assigned to all in-scope users before migration begins",
    "- The client's domain registrar is accessible and DNS records can be modified during the cutover window",
    "- End users will be available to validate their migrated content within 48 hours of cutover",
    "- Existing mobile devices will be reconfigured by end users following provided instructions; on-site mobile reconfiguration is not included unless explicitly listed",
    "- Security baseline on the target tenant will be enforced at cutover (multi-factor authentication, modern authentication only)",
    "- Third-party vendors (line-of-business application support, ISP, datacentre) are expected to cooperate during the cutover window. Where this cooperation is delayed or unavailable, project timelines may be affected.",
  ].join("\n"),
  risks: [
    "- Risk: identity collisions between source and target tenants (UPN conflicts, duplicate addresses).",
    "  Mitigation: identity mapping report in assessment phase; conflicts resolved before build commences.",
    "- Risk: free/busy and calendar lookups fail during coexistence window.",
    "  Mitigation: coexistence design validated in pilot wave; user comms set expectation that some directory features may be limited during transition.",
    "- Risk: shared content permissions or document links break across tenants.",
    "  Mitigation: permission and link audit in assessment; remap and link-rewrite tooling validated in pilot.",
    "- Risk: legacy authentication or app passwords blocked on target tenant.",
    "  Mitigation: dependency audit in assessment; modern-auth alternatives or exemptions agreed before baseline applied.",
    "- Risk: mail loops or delivery failures during coexistence.",
    "  Mitigation: mail-flow design reviewed and signed off in build phase; pilot wave proves end-to-end flow before production migration.",
    "- Risk: cross-platform feature gaps (e.g. Google Sites content, Power Automate flows, Apps Script automations).",
    "  Mitigation: dependency audit in assessment phase; out-of-scope items called out explicitly; rebuild estimated separately if requested.",
  ].join("\n"),
  rollback:
    "Rollback for a tenant migration is partial by nature: once content has been migrated and end users have generated new content in the target tenant, full reversion to the source is not practical. Our rollback plan therefore focuses on the cutover event itself — if a critical issue is identified before MX records are switched, the cutover is paused and rescheduled. After MX cutover, recovery is by forward-fix rather than rollback, with the source tenant retained read-only for {hypercareDays} days as a reference and recovery point for individual accounts.",
  outOfScope: [
    "- End-user training on the target platform's applications beyond migration-specific instructions",
    "- Cross-platform rebuild of automations, scripts, or workflows (Power Automate, Apps Script, third-party iPaaS) unless explicitly listed in the line items",
    "- Migration of platform-specific content with no cross-platform equivalent (e.g. Google Sites to SharePoint rebuild) unless explicitly listed",
    "- Endpoint management (Intune, Google Endpoint) configuration on the target tenant unless explicitly listed",
    "- Backup of the target tenant post-migration (third-party backup recommended but not included)",
    "- Configuration of integrations between the target tenant and third-party systems unless explicitly listed",
    "- Procurement or relicensing of any software not explicitly listed in the line items",
  ].join("\n"),
};

// ── Public surface ───────────────────────────────────────────────────

export const MIGRATION_DEFAULTS: Record<MigrationType, MigrationProfileDefaults> = {
  server: SERVER,
  m365: M365,
  workspace: WORKSPACE,
  tenant: TENANT,
};

/**
 * Hard-coded fallback used when neither a per-quote override nor an
 * org-level default is available for the requested block.
 *
 * The renderer (Delivery 26) calls this once per block:
 *
 *   resolveBlock(quote, org, type, "methodology")
 *     ?? quote.migrationMethodology
 *     ?? org[`default${TitleCase(type)}Methodology`]
 *     ?? defaultsFor(type).methodology
 */
export function defaultsFor(type: MigrationType): MigrationProfileDefaults {
  return MIGRATION_DEFAULTS[type];
}

/** Default hypercare days when neither quote nor org has set one. */
export const DEFAULT_HYPERCARE_DAYS = 14;
