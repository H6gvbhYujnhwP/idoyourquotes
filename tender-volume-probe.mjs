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
 * none of the effort. Worth half an hour to find out.
 *
 * WHERE TO RUN IT: the Render shell, which has Node and outbound
 * network access.
 *
 *   node tender-volume-probe.mjs
 *
 * No API key, no registration. Contracts Finder OCDS data is published
 * under the Open Government Licence.
 *
 * ── A WARNING ABOUT THE API ──────────────────────────────────────────
 * TWO FAULTS FOUND ON THE FIRST LIVE RUN, both fixed here:
 *
 *   1. PERCENT-ENCODED COLONS BREAK THE DATE FILTERS. Running the ISO
 *      timestamp through encodeURIComponent turns "09:52:03" into
 *      "09%3A52%3A03", and the API SILENTLY DISCARDS the parameter and
 *      falls back to its defaults — no error, no warning, just an empty
 *      result set. The dates must go on the query string with raw
 *      colons. This is the single most important gotcha for the real
 *      importer: a wrong date encoding looks exactly like "no tenders
 *      exist".
 *
 *   2. THE PUBLISHED GUIDE IS OUT OF DATE. The live spec takes
 *      `limit` (1-100), not `size`, and has no `order`/`orderBy` at
 *      all. Pagination is by `cursor`, not by page number. Sending
 *      unrecognised parameters appears to poison the whole query.
 *
 * The script still PRINTS the `uri` the API echoes back. That is the
 * only reliable way to see which parameters were actually honoured —
 * read it before trusting any number below it.
 *
 * It filters client-side because the search endpoint has no keyword,
 * no CPV and no region parameter. That constraint is the biggest thing
 * to know before designing the real importer: you ingest the whole
 * national feed and filter your own side.
 */

// ── Sweetbyte's qualification profile ────────────────────────────────
// Deliberately hardcoded here. In the real feature this lives on the
// organisation record so every IDYQ customer gets their own.

const PROFILE = {
  // Raised from the £2,000 originally proposed. Contracts at that
  // value are not tendered, they are bought on a card, and including
  // them buries the genuine opportunities in noise.
  minValue: 20_000,
  maxValue: 200_000,

  // Region is scored, not excluded — an 80k mostly-remote M365
  // contract in Manchester can still be a good fit. This list is for
  // COUNTING the local ones, not for throwing the rest away.
  regions: [
    "essex", "kent", "london", "hertfordshire", "suffolk",
    "cambridgeshire", "surrey", "sussex", "berkshire", "hampshire",
    "buckinghamshire", "oxfordshire", "bedfordshire",
  ],

  // CPV 72 = IT services. The others are the adjacent codes IT
  // procurements commonly sit under.
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

  // Wez's exclusions. Note "council" is NOT here — he clarified he
  // objects to red tape and framework lock-in, not to the buyer type,
  // and excluding councils would remove most of the feed's volume.
  // Framework and TUPE language is what actually signals the pain.
  redFlags: [
    "24/7 onsite", "24 x 7 onsite", "tupe", "framework agreement",
    "dynamic purchasing", "dps", "sub-contract", "subcontract",
    "iso 27001", "iso27001", "security clearance", "sc cleared",
    "nppv", "bpss",
  ],
};

const BASE = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search";
const MONTHS_BACK = 3;
const MAX_PAGES = 60; // Safety stop. The API rate-limits with a 403.

const iso = (d) => d.toISOString().slice(0, 19);
const lower = (s) => String(s ?? "").toLowerCase();

function matchesCpv(release) {
  const items = release?.tender?.items ?? [];
  const codes = [
    lower(release?.tender?.classification?.id),
    ...items.map((i) => lower(i?.classification?.id)),
    ...items.flatMap((i) => (i?.additionalClassifications ?? []).map((c) => lower(c?.id))),
  ].filter(Boolean);
  return codes.some((c) => PROFILE.cpvPrefixes.some((p) => c.startsWith(p)));
}

function matchesKeyword(text) {
  return PROFILE.keywords.some((k) => text.includes(k));
}

function matchesRegion(release, text) {
  const addrs = [
    lower(release?.tender?.deliveryAddress?.region),
    lower(release?.tender?.deliveryAddress?.locality),
    lower(release?.buyer?.address?.region),
    lower(release?.buyer?.address?.locality),
  ].join(" ");
  const haystack = addrs + " " + text;
  return PROFILE.regions.some((r) => haystack.includes(r));
}

function valueOf(release) {
  const v = release?.tender?.value?.amount ?? release?.planning?.budget?.amount?.amount;
  return typeof v === "number" && v > 0 ? v : null;
}

async function main() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - MONTHS_BACK);

  console.log("Contracts Finder volume probe");
  console.log(`Window : ${iso(from)} → ${iso(to)}`);
  console.log(`Profile: £${PROFILE.minValue.toLocaleString()}–£${PROFILE.maxValue.toLocaleString()}, CPV ${PROFILE.cpvPrefixes.join("/")}\n`);

  // Raw colons, NOT encodeURIComponent — see fault 1 in the header.
  // Only parameters the live spec actually accepts: publishedFrom,
  // publishedTo, stages, limit, cursor.
  let url =
    `${BASE}?publishedFrom=${iso(from)}` +
    `&publishedTo=${iso(to)}` +
    `&stages=tender&limit=100`;

  let total = 0;
  let cpvHits = 0;
  let keywordHits = 0;
  const shortlist = [];
  const flagged = [];
  let page = 0;

  while (url && page < MAX_PAGES) {
    page++;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "IDYQ-tender-probe" },
    });

    if (res.status === 403) {
      console.log(`\n⚠ Rate limited (403) at page ${page}. Numbers below are partial.`);
      break;
    }
    if (!res.ok) {
      console.log(`\n⚠ HTTP ${res.status} at page ${page}. Stopping.`);
      break;
    }

    const data = await res.json();

    // THE IMPORTANT LINE — what the API actually honoured, which may
    // differ from what we asked for.
    if (page === 1) {
      console.log(`API echoed: ${data.uri}`);
      // If publishedFrom is missing from the echo, the window was NOT
      // applied and every number below is meaningless. Say so loudly
      // rather than reporting a confident zero.
      const honoured = String(data.uri ?? "").includes("publishedFrom");
      console.log(
        honoured
          ? "Window honoured ✓\n"
          : "⚠ WINDOW NOT HONOURED — the date filter was discarded.\n",
      );
    }

    const releases = data.releases ?? [];
    if (releases.length === 0) break;
    total += releases.length;

    for (const r of releases) {
      const text = lower(`${r?.tender?.title} ${r?.tender?.description}`);
      const cpvOk = matchesCpv(r);
      const kwOk = matchesKeyword(text);
      if (cpvOk) cpvHits++;
      if (kwOk) keywordHits++;
      if (!cpvOk && !kwOk) continue;

      const value = valueOf(r);
      const inBand =
        value === null || (value >= PROFILE.minValue && value <= PROFILE.maxValue);
      if (!inBand) continue;

      const hits = PROFILE.redFlags.filter((f) => text.includes(f));
      const entry = {
        title: r?.tender?.title ?? "(untitled)",
        buyer: r?.buyer?.name ?? "(unknown buyer)",
        value,
        local: matchesRegion(r, text),
        closes: r?.tender?.tenderPeriod?.endDate?.slice(0, 10) ?? "—",
        flags: hits,
        ocid: r?.ocid,
      };
      (hits.length > 0 ? flagged : shortlist).push(entry);
    }

    // Pagination is by cursor. links.next is supplied by the OCDS
    // pagination extension; fall back to building it from the cursor
    // if only that is present.
    const next = data?.links?.next ?? null;
    url = next && next !== url ? next : null;

    await new Promise((r) => setTimeout(r, 400)); // be polite
  }

  const money = (v) => (v === null ? "value not stated" : `£${v.toLocaleString()}`);
  const local = shortlist.filter((s) => s.local);

  console.log(`Pages fetched      : ${page}`);
  console.log(`Notices scanned    : ${total}`);
  console.log(`CPV matches        : ${cpvHits}`);
  console.log(`Keyword matches    : ${keywordHits}`);
  console.log(`In value band      : ${shortlist.length + flagged.length}`);
  console.log(`Clean (no flags)   : ${shortlist.length}`);
  console.log(`  ...of those local: ${local.length}`);
  console.log(`Flagged            : ${flagged.length}\n`);

  console.log(`── THE NUMBER THAT MATTERS ──`);
  console.log(`${(shortlist.length / MONTHS_BACK).toFixed(1)} clean biddable IT tenders per month`);
  console.log(`${(local.length / MONTHS_BACK).toFixed(1)} of those in your region\n`);

  const show = (label, list) => {
    if (list.length === 0) return;
    console.log(`── ${label} ──`);
    for (const s of list.slice(0, 25)) {
      console.log(`  ${s.local ? "◆" : "·"} ${s.title.slice(0, 88)}`);
      console.log(`      ${s.buyer.slice(0, 60)} | ${money(s.value)} | closes ${s.closes}`);
      if (s.flags.length) console.log(`      ⚠ ${s.flags.join(", ")}`);
    }
    if (list.length > 25) console.log(`  ...and ${list.length - 25} more`);
    console.log("");
  };

  show("CLEAN SHORTLIST (◆ = in region)", shortlist);
  show("FLAGGED — read before dismissing", flagged);

  if (total === 0) {
    console.log("Zero notices returned. That is an API behaviour problem,");
    console.log("not a market problem. Check the echoed uri above — if it");
    console.log("does not contain your publishedFrom date, the parameter");
    console.log("was ignored and the query needs reworking.");
  }
}

main().catch((e) => {
  console.error("Probe failed:", e.message);
  process.exit(1);
});
