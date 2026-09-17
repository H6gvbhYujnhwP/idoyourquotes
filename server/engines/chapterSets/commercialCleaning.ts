/**
 * Commercial Cleaning chapter set — Delivery 2.14, Chunk 5.
 *
 * SHAPED BY HOW CLEANING IS ACTUALLY BOUGHT. Commercial cleaning in the
 * UK is largely procured by councils, housing associations and schools
 * through formal tenders, where the buyer publishes the sections you
 * must answer and scores each one separately. A section you do not
 * write scores zero, which is why this middle is longer than the IT
 * one rather than trimmed to match it.
 *
 * The section names follow live UK tender notices (Find a Tender,
 * Sep 2026) and the themes that recur across them: service delivery
 * methodology, staffing model and supervision, recruitment/vetting/
 * induction/training, business continuity including sickness and
 * absence cover, quality assurance and contract management. TUPE,
 * social value and environmental/waste management are scored sections
 * in their own right.
 *
 * TUPE and Social Value are CONDITIONAL — a private office job will
 * mention neither, and the chapters disappear rather than padding the
 * document.
 */

import { type SlotDef, TABLE_GUIDANCE, houseRules, onlyIf } from "./spine";

export const COMMERCIAL_CLEANING_MIDDLE: Omit<SlotDef, "slotIndex">[] = [
  {
    chapterId: "scope-and-frequencies",
    slotName: "Scope and Frequencies",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Scope of Service and Cleaning Frequencies",
    generateGuidance: houseRules(
      "Set out what is cleaned, where, and how often, following the areas and frequencies the evidence gives — daily, weekly, periodic and deep cleans. Where the evidence names specific areas (washrooms, communal areas, classrooms, kitchens), use those names rather than generic categories. Where it gives cleaning hours or access windows, state them exactly; where it does not, describe the arrangement without inventing times. " +
        TABLE_GUIDANCE +
        " An area-to-frequency mapping is a good use of one.",
    ),
  },
  {
    chapterId: "staffing-supervision-management",
    slotName: "Staffing, Supervision and Management",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Staffing, Supervision and Management",
    generateGuidance: houseRules(
      "The staffing model for this contract: how many operatives, their hours and pattern, who supervises them on site, and the management structure above that including the named point of contact for the client. Explain how supervision is evidenced rather than asserted — site visits, checks, sign-off. Use only numbers the evidence gives.",
    ),
  },
  {
    chapterId: "recruitment-vetting-training",
    slotName: "Recruitment, Vetting, Induction and Training",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Recruitment, Vetting, Induction and Training",
    generateGuidance: houseRules(
      "How operatives are recruited, what pre-employment checks are carried out (right to work, references, and DBS where the setting requires it — schools and care settings normally do), what site induction covers, and what ongoing training is provided. Name accreditations only where the evidence states them, such as BICSc training. If the evidence names a setting that implies enhanced checks, address that setting specifically.",
    ),
  },
  {
    chapterId: "business-continuity",
    slotName: "Business Continuity and Absence Cover",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Business Continuity and Absence Cover",
    generateGuidance: houseRules(
      "How the service continues when an operative is sick, on holiday or leaves: the cover arrangements, how quickly cover is deployed, and how the client is told. Buyers ask for this by name and score it, so answer it directly rather than folding it into staffing. Also cover wider disruption where the evidence raises it.",
    ),
  },
  {
    chapterId: "equipment-materials-coshh",
    slotName: "Equipment, Materials and COSHH",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Equipment, Materials and COSHH",
    generateGuidance: houseRules(
      "What equipment and materials are provided and by whom, how chemicals are stored, handled and controlled under COSHH, and how cross-contamination is prevented — colour-coded equipment is the standard answer where the evidence supports it. Mention eco-friendly or reduced-chemical products only where the evidence states them.",
    ),
  },
  {
    chapterId: "health-safety-compliance",
    slotName: "Health, Safety and Compliance",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Health, Safety and Compliance",
    generateGuidance: houseRules(
      "Risk assessments and method statements, accident and incident reporting, safe working around building users, and the accreditations held. Name insurance cover, ISO standards or SSIP schemes such as CHAS or SafeContractor only where the evidence states them.",
    ),
  },
  {
    chapterId: "quality-assurance",
    slotName: "Quality Assurance and Contract Management",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Quality Assurance and Contract Management",
    generateGuidance: houseRules(
      "How quality is measured and evidenced: audits and their frequency, scoring, what happens when a standard is missed, how complaints are handled and within what timescale, and the review meetings held with the client. Be concrete about the feedback loop — this is the section buyers use to tell a managed service from a supply of labour.",
    ),
  },
  {
    chapterId: "environmental-waste",
    slotName: "Environmental and Waste Management",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Environmental and Waste Management",
    generateGuidance: houseRules(
      "Waste segregation and disposal, recycling, reducing chemical and water use, and any environmental accreditation the evidence states. Keep it specific to how the service is delivered rather than a statement of values.",
    ),
  },
  {
    chapterId: "tupe",
    slotName: "TUPE",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "TUPE and Staff Transfer",
    generateGuidance: houseRules(
      "How the transfer of the incumbent's staff is handled: consultation, continuity of terms, the information needed from the outgoing provider, and how continuity of service is protected during transfer. Use only the staff numbers and details the evidence gives." +
        onlyIf("the evidence mentions TUPE, an incumbent provider, or staff transferring"),
    ),
  },
  {
    chapterId: "social-value",
    slotName: "Social Value",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Social Value",
    generateGuidance: houseRules(
      "Local employment, fair pay, training and progression, community benefit, and environmental commitments expressed as things that will actually be done on this contract. Commit only to what the evidence supports; never invent a figure, a percentage or a pledge." +
        onlyIf("the evidence mentions social value, community benefit, local employment or the Social Value Act"),
    ),
  },
  {
    chapterId: "mobilisation-plan",
    slotName: "Mobilisation Plan",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Mobilisation Plan",
    generateGuidance: houseRules(
      "How the service is stood up: site survey, staffing in place, equipment and materials delivered, induction and training completed, and the first weeks of closer supervision. Describe the sequence and what happens at each stage. State no dates and no durations the evidence does not give — say 'before the service begins' rather than naming a week.",
    ),
  },
];
