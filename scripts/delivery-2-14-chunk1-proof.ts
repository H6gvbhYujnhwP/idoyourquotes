/**
 * Delivery 2.14 Chunk 1 proof — sector vocabulary.
 *
 * Before this chunk the server's tradePresetToSector() matched on
 * hyphenated ids while every stored value is underscored, so all 25
 * trade presets fell through to the IT Services default. This asserts
 * that each go-to-market sector now reaches its own six designs, that
 * the designs exist on disk, and that the four registries finally agree
 * on one vocabulary.
 *
 *   npx tsx scripts/delivery-2-14-chunk1-proof.ts
 */

import * as fs from "fs";
import * as path from "path";
import {
  SECTOR_KEYS,
  GTM_SECTOR_KEYS,
  TEMPLATE_SECTORS,
  canonicalSectorKey,
  templateSectorFor,
  resolveTemplateSector,
  hasOwnTemplates,
} from "../shared/sectors";
import { TRADE_PRESETS } from "../server/tradePresets";
import { isSeedableSector } from "../server/catalogSeeds/index";
import { isDemoSector } from "../server/demoQuotes/index";
import { tradePresetToSector } from "../server/services/templateLibrary";
import { TRADE_SECTOR_OPTIONS, VISIBLE_TRADE_SECTOR_OPTIONS } from "../client/src/lib/tradeSectors";

let pass = 0;
let fail = 0;
const ok = (name: string, actual: unknown, expected: unknown) => {
  const a = String(actual);
  const e = String(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name} = ${a}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}: got ${a}, expected ${e}`);
  }
};

console.log("── Each go-to-market sector reaches its own designs ──");
ok("it_services", templateSectorFor("it_services"), "it-services");
ok("website_marketing", templateSectorFor("website_marketing"), "web-marketing");
ok("commercial_cleaning", templateSectorFor("commercial_cleaning"), "commercial-cleaning");
ok("pest_control", templateSectorFor("pest_control"), "pest-control");

console.log("\n── The server's own resolver agrees (it used to return null) ──");
for (const key of GTM_SECTOR_KEYS) {
  ok(`templateLibrary.tradePresetToSector(${key})`, tradePresetToSector(key), templateSectorFor(key));
}

console.log("\n── Historical spellings still resolve ──");
ok("it-services (hyphen)", templateSectorFor("it-services"), "it-services");
ok("it (shorthand)", templateSectorFor("it"), "it-services");
ok("website-marketing", templateSectorFor("website-marketing"), "web-marketing");
ok("web-marketing", templateSectorFor("web-marketing"), "web-marketing");
ok("digital-marketing", templateSectorFor("digital-marketing"), "web-marketing");
ok("cleaning", templateSectorFor("cleaning"), "commercial-cleaning");
ok("pest", templateSectorFor("pest-control"), "pest-control");
ok("IT_SERVICES (case)", templateSectorFor("IT_SERVICES"), "it-services");
ok("  it_services   (whitespace)", templateSectorFor("  it_services   "), "it-services");

console.log("\n── Sectors with no designs fall back, and say so ──");
ok("plumbing has own templates", hasOwnTemplates("plumbing"), "false");
ok("plumbing resolves to default", resolveTemplateSector("plumbing"), "it-services");
ok("null resolves to default", resolveTemplateSector(null), "it-services");
ok("unknown resolves to default", resolveTemplateSector("not-a-sector"), "it-services");
ok("unknown has no canonical key", canonicalSectorKey("not-a-sector"), "null");

console.log("\n── Every design folder the vocabulary promises exists on disk ──");
const libraryRoot = path.resolve(process.cwd(), "server", "templates", "library");
for (const sector of TEMPLATE_SECTORS) {
  const dir = path.join(libraryRoot, sector);
  const styles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
    : [];
  ok(`${sector} style count`, styles.length, 6);
}

console.log("\n── The registries agree on one vocabulary ──");
const presetKeys = new Set(Object.keys(TRADE_PRESETS));
for (const key of GTM_SECTOR_KEYS) {
  ok(`${key} has a trade preset`, presetKeys.has(key), "true");
  ok(`${key} has a catalogue seed`, isSeedableSector(key), "true");
  ok(`${key} has a demo quote`, isDemoSector(key), "true");
}

console.log("\n── Every signup option is a sector the vocabulary knows ──");
const unknownOptions = TRADE_SECTOR_OPTIONS.filter((o) => canonicalSectorKey(o.value) === null);
ok("signup options unknown to the vocabulary", unknownOptions.map((o) => o.value).join(",") || "none", "none");
const optionsWithoutPreset = TRADE_SECTOR_OPTIONS.filter((o) => !presetKeys.has(o.value));
ok("signup options with no trade preset", optionsWithoutPreset.map((o) => o.value).join(",") || "none", "none");
ok("sector keys defined", SECTOR_KEYS.length, TRADE_SECTOR_OPTIONS.length);
ok("visible signup options", VISIBLE_TRADE_SECTOR_OPTIONS.length, 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
