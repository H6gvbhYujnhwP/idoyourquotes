/**
 * tender-volume-probe.mjs
 *
 * A ONE-OFF DIAGNOSTIC, not production code. It answers a single
 * question before any tender feature gets built:
 *
 *   How many genuinely biddable IT tenders actually appear in
 *   Sweetbyte's region and value band each month?
 *
 * If the answer is forty, a discovery engine is worth building. If it
 * is four, a saved search and an email alert would do the same job for
 * none of the effort.
 *
 * WHERE TO RUN IT: the Render shell.
 *
 *   node tender-volume-probe.mjs
 *
 * No API key. Contracts Finder OCDS data is published under the Open
 * Government Licence.
 *
 * ── THREE FAULTS FOUND ON LIVE RUNS, ALL FIXED HERE ──────────────────
 *
 *   1. PERCENT-ENCODED COLONS SILENTLY BREAK THE DATE FILTERS.
 *      encodeURIComponent turns "09:52:03" into "09%3A52%3A03", and the
 *      API DISCARDS the parameter and falls back to its defaults — no
 *      error, HTTP 200, valid OCDS envelope, empty list. A wrong date
 *      encoding is indistinguishable from "no tenders exist". This is
 *      the most dangerous gotcha for the real importer.
 *
 *   2. THE PUBLISHED GUIDE IS OUT OF DATE. The live spec takes `limit`
 *      (1-100), not `size`, and has no `order`/`orderBy`. Pagination is
 *      by `cursor`. Unrecognised parameters appear to poison the query.
 *
 *   3. A WIDE DATE WINDOW TIMES OUT. Three months in one request
 *      returned HTTP 504 after five minutes. The window must be walked
 *      in slices. This starts at 7-day slices and halves down to 1 day
 *      whenever a slice times out.
 *
 * The search endpoint has no keyword, no CPV and no region parameter,
 * so all filtering is client-side. That is the other thing to know
 * before designing the importer: you ingest the whole national feed
 * and filter your own side.
 */

// ── Sweetbyte's qualification profile ────────────────────────────────
// Hardcoded here. In the real feature this lives on the organisation
// record so every IDYQ customer gets their own.

const PROFILE = {
  // Raised from the £2,000 originally proposed — contracts at that
  // value are bought on a card, not tendered, and including them
  // buries the genuine opportunities in noise.
  minValue: 20_000,
  maxValue: 200_000,

  // Region is scored, not excluded. An £80k mostly-remote M365
  // contract in Manchester can still be a good fit. This list marks
  // the local ones rather than discarding the rest.
  regions: [
    "essex", "kent", "london", "hertfordshire", "suffolk",
    "cambridgeshire", "surrey", "sussex", "berkshire", "hampshire",
    "buckinghamshire", "oxfordshire", "bedfordshire", "norfolk",
  ],

  cpvPrefixes: ["72", "48", "302", "324", "503", "516", "642"],

  keywords: [
    "it support", "ict support", "managed it", "managed ict", "msp",
    "service desk", "helpdesk", "help desk", "end user computing",
    "microsoft 365", "office 365", "m365", "azure", "sharepoint",
    "cyber security", "cybersecurity", "mdr", "edr", "endpoint",
    "penetration test", "cyber essentials", "soc",
    "network support", "wi-fi", "wifi", "firewall", "lan", "wan",
    "infrastructure support", "server support", "cloud migration",
    "backup", "disaster recovery", "voip", "telephony",
    "unified communications", "connectivity", "desktop support",
  ],

  // "council" is deliberately NOT here. Wez objects to red tape and
  // framework lock-in, not to the buyer type, and excluding councils
  // would remove most of the feed's volume. Framework and TUPE
  // language is what actually signals the pain.
  redFlags: [
    "24/7 onsite", "24 x 7 onsite", "tupe", "framework agreement",
    "dynamic purchasing", "sub-contract", "subcontract",
    "iso 27001", "iso27001", "security clearance", "sc cleared",
    "nppv", "bpss",
  ],
};

const BASE = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search";
const MONTHS_BACK = 3;
const START_SLICE_DAYS = 7;   // halves to 3, then 1, on timeout
const REQUEST_TIMEOUT_MS = 90_000;
const POLITE_DELAY_MS = 500;
const MAX_REQUESTS = 400;     // hard safety stop

const iso = (d) => d.toISOString().slice(0, 19);
const lower = (s) => String(s ?? "").toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (d) => d.toISOString().slice(0, 10);

let requestCount = 0;

/**
 * One HTTP call, with a timeout so a hanging request cannot stall the
 * whole probe. Returns { ok, status, data }.
 */
async function get(url) {
  requestCount++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "IDYQ-tender-probe" },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: 200, data: await res.json() };
  } catch (e) {
    // Our own timeout reports like a 504 so the caller narrows the
    // slice rather than giving up.
    return { ok: false, status: e.name === "AbortError" ? 504 : 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch every release in one date slice, following cursors.
 * Returns null if the slice failed and should be split or abandoned.
 */
async function fetchSlice(from, to, onEcho) {
  // Raw colons — NOT encodeURIComponent. See fault 1 in the header.
  let url =
    `${BASE}?publishedFrom=${iso(from)}` +
    `&publishedTo=${iso(to)}` +
    `&stages=tender&limit=100`;

  const releases = [];
  let guard = 0;

  while (url && guard < 40 && requestCount < MAX_REQUESTS) {
    guard++;
    let attempt = 0;
    let result = null;

    while (attempt < 3) {
      result = await get(url);
      if (result.ok) break;
      if (result.status === 504) return null;      // caller splits
      if (result.status === 403) {
        attempt++;
        console.log(`\n      rate limited, backing off ${attempt * 20}s...`);
        await sleep(attempt * 20_000);
        continue;
      }
      return null;
    }
    if (!result || !result.ok) return null;

    if (onEcho && guard === 1) onEcho(result.data?.uri);

    releases.push(...(result.data?.releases ?? []));

    const next = result.data?.links?.next ?? null;
    url = next && next !== url ? next : null;
    if (url) await sleep(POLITE_DELAY_MS);
  }

  return releases;
}

// ── Matching ─────────────────────────────────────────────────────────

function matchesCpv(r) {
  const items = r?.tender?.items ?? [];
  const codes = [
    lower(r?.tender?.classification?.id),
    ...items.map((i) => lower(i?.classification?.id)),
    ...items.flatMap((i) => (i?.additionalClassifications ?? []).map((c) => lower(c?.id))),
  ].filter(Boolean);
  return codes.some((c) => PROFILE.cpvPrefixes.some((p) => c.startsWith(p)));
}

const matchesKeyword = (text) => PROFILE.keywords.some((k) => text.includes(k));

function matchesRegion(r, text) {
  const haystack = [
    lower(r?.tender?.deliveryAddress?.region),
    lower(r?.tender?.deliveryAddress?.locality),
    lower(r?.buyer?.address?.region),
    lower(r?.buyer?.address?.locality),
  ].join(" ") + " " + text;
  return PROFILE.regions.some((x) => haystack.includes(x));
}

function valueOf(r) {
  const v = r?.tender?.value?.amount ?? r?.planning?.budget?.amount?.amount;
  return typeof v === "number" && v > 0 ? v : null;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - MONTHS_BACK);

  console.log("Contracts Finder volume probe");
  console.log(`Window : ${day(start)} -> ${day(end)}`);
  console.log(`Profile: GBP ${PROFILE.minValue.toLocaleString()}-${PROFILE.maxValue.toLocaleString()}, CPV ${PROFILE.cpvPrefixes.join("/")}`);
  console.log(`Slicing: ${START_SLICE_DAYS}-day chunks, halving on timeout\n`);

  const all = [];
  const seen = new Set();
  let echoed = false;
  let windowHonoured = null;
  let failedSlices = 0;

  const queue = [];
  for (let t = new Date(start); t < end; ) {
    const sliceEnd = new Date(t);
    sliceEnd.setDate(sliceEnd.getDate() + START_SLICE_DAYS);
    queue.push([new Date(t), sliceEnd > end ? new Date(end) : sliceEnd]);
    t = new Date(sliceEnd);
  }

  while (queue.length > 0 && requestCount < MAX_REQUESTS) {
    const [from, to] = queue.shift();
    const spanDays = Math.max(1, Math.round((to - from) / 86_400_000));
    process.stdout.write(`  ${day(from)} -> ${day(to)} (${spanDays}d) ... `);

    const releases = await fetchSlice(from, to, (uri) => {
      if (echoed) return;
      echoed = true;
      windowHonoured = String(uri ?? "").includes("publishedFrom");
      console.log("");
      console.log(`  API echoed: ${uri}`);
      console.log(
        windowHonoured
          ? "  Window honoured OK\n"
          : "  !! WINDOW NOT HONOURED - date filter discarded, results meaningless.\n",
      );
      process.stdout.write(`  ${day(from)} -> ${day(to)} (${spanDays}d) ... `);
    });

    if (releases === null) {
      if (spanDays <= 1) {
        console.log("failed (giving up on this day)");
        failedSlices++;
      } else {
        const mid = new Date((from.getTime() + to.getTime()) / 2);
        console.log("timed out - splitting");
        queue.unshift([mid, to]);
        queue.unshift([from, mid]);
      }
      continue;
    }

    let added = 0;
    for (const r of releases) {
      const key = r?.ocid ?? r?.id;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      all.push(r);
      added++;
    }
    console.log(`${releases.length} notices (${added} new)`);
    await sleep(POLITE_DELAY_MS);
  }

  // ── Filter ─────────────────────────────────────────────────────────
  let cpvHits = 0, keywordHits = 0;
  const shortlist = [], flagged = [];

  for (const r of all) {
    const text = lower(`${r?.tender?.title} ${r?.tender?.description}`);
    const cpvOk = matchesCpv(r);
    const kwOk = matchesKeyword(text);
    if (cpvOk) cpvHits++;
    if (kwOk) keywordHits++;
    if (!cpvOk && !kwOk) continue;

    const value = valueOf(r);
    if (value !== null && (value < PROFILE.minValue || value > PROFILE.maxValue)) continue;

    const hits = PROFILE.redFlags.filter((f) => text.includes(f));
    const entry = {
      title: r?.tender?.title ?? "(untitled)",
      buyer: r?.buyer?.name ?? "(unknown buyer)",
      value,
      local: matchesRegion(r, text),
      closes: r?.tender?.tenderPeriod?.endDate?.slice(0, 10) ?? "-",
      flags: hits,
    };
    (hits.length > 0 ? flagged : shortlist).push(entry);
  }

  const money = (v) => (v === null ? "value not stated" : `GBP ${v.toLocaleString()}`);
  const local = shortlist.filter((s) => s.local);

  console.log(`\n${"-".repeat(60)}`);
  console.log(`HTTP requests made : ${requestCount}`);
  console.log(`Slices that failed : ${failedSlices}`);
  console.log(`Notices scanned    : ${all.length}`);
  console.log(`CPV matches        : ${cpvHits}`);
  console.log(`Keyword matches    : ${keywordHits}`);
  console.log(`In value band      : ${shortlist.length + flagged.length}`);
  console.log(`Clean (no flags)   : ${shortlist.length}`);
  console.log(`  ...of those local: ${local.length}`);
  console.log(`Flagged            : ${flagged.length}\n`);

  if (windowHonoured === false) {
    console.log("!! The date window was discarded by the API, so these");
    console.log("   numbers describe an unknown period. Do not use them.\n");
  } else if (all.length === 0) {
    console.log("Zero notices retrieved. That is an API problem, not a");
    console.log("market problem - every slice failed.\n");
  } else {
    console.log("== THE NUMBER THAT MATTERS ==");
    console.log(`${(shortlist.length / MONTHS_BACK).toFixed(1)} clean biddable IT tenders per month`);
    console.log(`${(local.length / MONTHS_BACK).toFixed(1)} of those in your region\n`);
  }

  const show = (label, list) => {
    if (list.length === 0) return;
    console.log(`== ${label} ==`);
    for (const s of list.slice(0, 30)) {
      console.log(`  ${s.local ? "*" : " "} ${s.title.slice(0, 88)}`);
      console.log(`      ${s.buyer.slice(0, 60)} | ${money(s.value)} | closes ${s.closes}`);
      if (s.flags.length) console.log(`      !! ${s.flags.join(", ")}`);
    }
    if (list.length > 30) console.log(`  ...and ${list.length - 30} more`);
    console.log("");
  };

  show("CLEAN SHORTLIST (* = in region)", shortlist);
  show("FLAGGED - read before dismissing", flagged);
}

main().catch((e) => {
  console.error("Probe failed:", e.message);
  process.exit(1);
});
