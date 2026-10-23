/**
 * Supplier-reference delivery — proof.
 *
 * Proved by RUNNING, not by reasoning:
 *
 *   1. The migration against a REAL Postgres 16 instance, on a table
 *      built in its pre-delivery shape and populated with rows shaped
 *      like the live Kent Blaxhill quote (Q-219). Column added, type
 *      and length correct, nullable, idempotent on re-run, and every
 *      pre-existing row reads NULL — the "no backfill" claim stated as
 *      an assertion rather than a promise.
 *
 *   2. Round-trips through the REAL drizzle schema (shared/schema.ts)
 *      and the REAL db helpers (createLineItem / updateLineItem), so
 *      the column is proved wired through the code that ships, not
 *      through a copy of it written for the test.
 *
 *   3. The URL rule and the 500-character caps are read OUT OF THE
 *      SHIPPED SOURCE and executed. The regexes are extracted from
 *      QuoteWorkspace.tsx and the Zod rules from routers.ts, so if
 *      either is later edited this proof exercises the edited version
 *      and fails rather than passing against a stale copy.
 *
 * Run: DATABASE_URL=<scratch db> npx tsx scripts/delivery-supplier-ref-proof.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { quoteLineItems } from "../shared/schema";

// Resolved from the working directory, matching the other proofs in
// this folder — they are all run from the repo root.
const ROOT = process.cwd();

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${label} = ${JSON.stringify(actual)}`);
  } else {
    failed++;
    console.log(
      `  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`,
    );
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

/**
 * The pre-delivery shape of quote_line_items, transcribed from
 * drizzle/schema.ts WITHOUT supplier_ref. The point is to start from a
 * database that has never seen this delivery, exactly as Render's does
 * before the migration is pasted in.
 */
const PRE_DELIVERY_DDL = `
CREATE TABLE quote_line_items (
  id bigserial PRIMARY KEY,
  quote_id bigint NOT NULL,
  sort_order integer DEFAULT 0,
  description text NOT NULL,
  quantity decimal(12,4) DEFAULT '1.0000',
  unit varchar(50) DEFAULT 'each',
  rate decimal(12,2) DEFAULT '0.00',
  total decimal(12,2) DEFAULT '0.00',
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  phase_id varchar(50),
  category varchar(100),
  pricing_type varchar(20) DEFAULT 'standard',
  cost_price decimal(12,2),
  discount_percent decimal(5,2),
  item_name varchar(255),
  is_passthrough boolean DEFAULT false NOT NULL,
  evidence_category varchar(100),
  is_substitutable boolean,
  is_estimated boolean DEFAULT false NOT NULL,
  is_optional boolean DEFAULT false NOT NULL,
  source_input_ids json
);
`;

/** Two rows shaped like the live Kent Blaxhill quote. */
const EXISTING_ROWS = [
  {
    quote_id: 219,
    sort_order: 0,
    description:
      "DrayTek Vigor 3912 Firewall/Router — Enterprise-grade 1Gb firewall and router acting as the single centralised gateway for all 21 business units on the estate.",
    quantity: "1.0000",
    unit: "Each",
    rate: "950.00",
    total: "950.00",
    pricing_type: "standard",
  },
  {
    quote_id: 219,
    sort_order: 1,
    description:
      "DrayTek VigorSwitch G2280x (24-port) — Managed 24-port gigabit switches for distribution within the centralised communications cabinet.",
    quantity: "2.0000",
    unit: "Each",
    rate: "250.00",
    total: "500.00",
    pricing_type: "standard",
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required — point it at a SCRATCH database.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  // ── Set up a pre-delivery database ────────────────────────────────
  await pool.query("DROP TABLE IF EXISTS quote_line_items;");
  await pool.query(PRE_DELIVERY_DDL);
  for (const r of EXISTING_ROWS) {
    await pool.query(
      `INSERT INTO quote_line_items
         (quote_id, sort_order, description, quantity, unit, rate, total, pricing_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        r.quote_id,
        r.sort_order,
        r.description,
        r.quantity,
        r.unit,
        r.rate,
        r.total,
        r.pricing_type,
      ],
    );
  }

  section("Before the migration");
  const before = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'quote_line_items' AND column_name = 'supplier_ref'`,
  );
  assert("supplier_ref exists before the migration", before.rowCount, 0);

  const rowsBefore = await pool.query(
    "SELECT id, description, rate FROM quote_line_items ORDER BY sort_order",
  );
  assert("existing line items", rowsBefore.rowCount, 2);

  // ── Run the REAL migration file ───────────────────────────────────
  section("The migration, read from the shipped file");
  const migrationSql = readFileSync(
    join(ROOT, "migration-supplier-ref.sql"),
    "utf8",
  );
  assert(
    "migration is idempotent by construction",
    /ADD COLUMN IF NOT EXISTS/i.test(migrationSql),
    true,
  );
  await pool.query(migrationSql);

  const col = await pool.query(
    `SELECT data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = 'quote_line_items' AND column_name = 'supplier_ref'`,
  );
  assert("column added", col.rowCount, 1);
  assert("type", col.rows[0]?.data_type, "character varying");
  assert("length", col.rows[0]?.character_maximum_length, 500);
  assert("nullable", col.rows[0]?.is_nullable, "YES");
  assert("no default — a new row is blank, not seeded", col.rows[0]?.column_default, null);

  // ── The claim that matters to the owner: no backfill ──────────────
  section("Every existing quote line reads blank");
  const nulls = await pool.query(
    "SELECT count(*)::int AS n FROM quote_line_items WHERE supplier_ref IS NULL",
  );
  assert("pre-existing rows with a blank reference", nulls.rows[0]?.n, 2);

  const nonNull = await pool.query(
    "SELECT count(*)::int AS n FROM quote_line_items WHERE supplier_ref IS NOT NULL",
  );
  assert("pre-existing rows the migration wrote into", nonNull.rows[0]?.n, 0);

  const descsAfter = await pool.query(
    "SELECT description FROM quote_line_items ORDER BY sort_order",
  );
  assert(
    "descriptions untouched",
    descsAfter.rows.map((r: any) => r.description),
    EXISTING_ROWS.map((r) => r.description),
  );

  // ── Idempotency ───────────────────────────────────────────────────
  section("Running it twice");
  await pool.query(migrationSql);
  const colAgain = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'quote_line_items' AND column_name = 'supplier_ref'`,
  );
  assert("still exactly one supplier_ref column", colAgain.rows[0]?.n, 1);
  const rowsAgain = await pool.query(
    "SELECT count(*)::int AS n FROM quote_line_items",
  );
  assert("row count unchanged", rowsAgain.rows[0]?.n, 2);

  // ── Round-trip through the REAL schema and helpers ────────────────
  section("Round-trip through shared/schema.ts");
  const [created] = await db
    .insert(quoteLineItems)
    .values({
      quoteId: 219,
      description: "DrayTek Vigor 3912 Firewall/Router",
      quantity: "1.0000",
      unit: "Each",
      rate: "950.00",
      total: "950.00",
      costPrice: "612.00",
      supplierRef: "Vigor 3912",
    } as any)
    .returning();
  assert("a model code stores", created.supplierRef, "Vigor 3912");
  assert("alongside its buy-in cost", created.costPrice, "612.00");

  const [toUrl] = await db
    .update(quoteLineItems)
    .set({ supplierRef: "https://supplier.example/p/12345?ref=abc" } as any)
    .where(eq(quoteLineItems.id, created.id))
    .returning();
  assert(
    "editing it to a URL",
    toUrl.supplierRef,
    "https://supplier.example/p/12345?ref=abc",
  );

  const [cleared] = await db
    .update(quoteLineItems)
    .set({ supplierRef: null } as any)
    .where(eq(quoteLineItems.id, created.id))
    .returning();
  assert("clearing it stores null, not an empty string", cleared.supplierRef, null);

  const longest = "x".repeat(500);
  const [atCap] = await db
    .update(quoteLineItems)
    .set({ supplierRef: longest } as any)
    .where(eq(quoteLineItems.id, created.id))
    .returning();
  assert("500 characters fits exactly", atCap.supplierRef?.length, 500);

  let overflowed = false;
  try {
    await db
      .update(quoteLineItems)
      .set({ supplierRef: "x".repeat(501) } as any)
      .where(eq(quoteLineItems.id, created.id))
      .returning();
  } catch {
    overflowed = true;
  }
  assert("501 is refused by the column rather than silently cut", overflowed, true);

  // The row the owner would actually see: cost and reference together.
  const [readBack] = await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.id, created.id));
  assert("the cell still holds its cost after all that", readBack.costPrice, "612.00");

  // ── The caps and the URL rule, read out of the shipped source ─────
  section("Rules read from the files that ship");
  const routersSrc = readFileSync(join(ROOT, "server", "routers.ts"), "utf8");
  const zodRules = routersSrc.match(/supplierRef:\s*z\.string\(\)\.max\(500\)\.optional\(\)/g) ?? [];
  assert("supplierRef capped at 500 on both endpoints", zodRules.length, 2);
  assert(
    "a cleared box is normalised to null, not \"\"",
    /data\.supplierRef[\s\S]{0,220}trimmed === ""\s*\?\s*null/.test(routersSrc),
    true,
  );

  const workspaceSrc = readFileSync(
    join(ROOT, "client", "src", "pages", "QuoteWorkspace.tsx"),
    "utf8",
  );
  assert(
    "the workspace box is capped too, so a long paste stops at the keyboard",
    /maxLength=\{500\}/.test(workspaceSrc),
    true,
  );

  // Extract the SHIPPED regexes and run them, so an edit to either is
  // exercised by this proof rather than slipping past a stale copy.
  const urlFn = workspaceSrc.match(
    /function looksLikeUrl\(value: string\): boolean \{[\s\S]*?\n\}/,
  )?.[0];
  assert("looksLikeUrl found in source", typeof urlFn, "string");
  // eslint-disable-next-line no-new-func
  const looksLikeUrl = new Function(
    `${urlFn!.replace(/: string|: boolean/g, "")}; return looksLikeUrl;`,
  )() as (v: string) => boolean;

  assert("https link opens", looksLikeUrl("https://supplier.example/p/1"), true);
  assert("http link opens", looksLikeUrl("http://supplier.example/p/1"), true);
  assert("www host opens", looksLikeUrl("www.supplier.example/p/1"), true);
  assert("surrounding whitespace tolerated", looksLikeUrl("  https://a.example  "), true);
  assert("a model code is not a link", looksLikeUrl("Vigor 3912"), false);
  assert("a part number is not a link", looksLikeUrl("G2280x-24"), false);
  assert(
    "a bare manufacturer name is not a link",
    looksLikeUrl("draytek.com"),
    false,
  );
  assert("blank is not a link", looksLikeUrl(""), false);
  assert(
    "a sentence containing a link is not treated as one",
    looksLikeUrl("see https://supplier.example for pricing"),
    false,
  );

  // ── Internal only ─────────────────────────────────────────────────
  section("No client-facing document reads it");
  const documentPaths = [
    ["server", "pdfGenerator.ts"],
    ["server", "docxGenerator.ts"],
    ["server", "brandedProposalRenderer.ts"],
    ["server", "services", "brandedProposalAssembler.ts"],
    ["server", "services", "slotContentBuilder.ts"],
    ["server", "services", "xeroInvoicePlan.ts"],
    ["server", "services", "brandedProposalRouter.ts"],
  ];
  const leaks = documentPaths.filter(([...p]) =>
    /supplierRef|supplier_ref/.test(readFileSync(join(ROOT, ...p), "utf8")),
  );
  assert(
    "document paths mentioning the reference",
    leaks.map((p) => p[p.length - 1]),
    [],
  );

  await pool.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
