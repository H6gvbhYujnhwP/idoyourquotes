/**
 * Pest Control chapter set — Delivery 2.14, Chunk 5.
 *
 * SHAPED BY HOW PEST CONTROL IS BOUGHT AND REGULATED. Like cleaning,
 * much of it is procured formally — councils, housing associations and
 * food businesses — and the British Pest Control Association's guidance
 * on contract specifications sets out what a client is entitled to
 * expect. Two things sit at the centre of that guidance and are named
 * here rather than implied:
 *
 *   Integrated Pest Management. Prevention first, monitoring second,
 *   and the most harmful control methods only as a last resort. It is
 *   the organising idea of the whole discipline; a proposal that does
 *   not name it reads as a pest killer rather than a pest manager.
 *
 *   Records as due diligence. For a food business the contractor's
 *   documentation IS the client's evidence of compliance in an audit,
 *   so reporting is not administration, it is part of the product.
 *
 * Also reflected: technician competence and accreditation (BPCA
 * membership, CEPA certification, CPD), tolerance thresholds, response
 * times, and safeguarding vulnerable residents in housing settings.
 */

import { type SlotDef, TABLE_GUIDANCE, houseRules, onlyIf } from "./spine";

export const PEST_CONTROL_MIDDLE: Omit<SlotDef, "slotIndex">[] = [
  {
    chapterId: "survey-risk-assessment",
    slotName: "Survey Findings and Risk Assessment",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Survey Findings and Risk Assessment",
    generateGuidance: houseRules(
      "What the survey found and what it means: the pest species involved, evidence of activity, the conditions attracting or harbouring them, and the points of entry or risk identified. Where the evidence describes the site — its type, size, number of buildings or units — anchor the findings to it. Report only what the evidence contains; never invent a species, a level of activity or a finding.",
    ),
  },
  {
    chapterId: "ipm-approach",
    slotName: "Integrated Pest Management Approach",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Integrated Pest Management Approach",
    generateGuidance: houseRules(
      "Explain the IPM principle applied to this site: prevention and proofing first, monitoring to detect activity early, non-chemical controls next, and the most harmful methods only as a last resort and only where justified. Cover who is responsible for what between contractor and client — proofing works, housekeeping, removal of harbourage, access equipment — since split responsibility is the commonest cause of a programme failing. State the tolerance threshold at which the programme escalates where the evidence gives one.",
    ),
  },
  {
    chapterId: "treatment-programme",
    slotName: "Treatment Programme and Frequencies",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Treatment Programme and Visit Frequencies",
    generateGuidance: houseRules(
      "The planned programme: which areas are covered, what is installed or inspected at each, and how often visits take place. Follow the frequencies the evidence gives and never invent one. " +
        TABLE_GUIDANCE +
        " An area or pest against visit frequency and method is a good use of one.",
    ),
  },
  {
    chapterId: "response-and-callouts",
    slotName: "Response Times and Call-Outs",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Response Times and Call-Outs",
    generateGuidance: houseRules(
      "How a reactive call-out is raised, what happens next, and within what timescale. State only response times the evidence gives — an invented response time is a contractual commitment the supplier has not agreed to. Where the evidence gives none, describe the process without a number. Cover what counts as an emergency and how out-of-hours requests are handled if the evidence addresses it.",
    ),
  },
  {
    chapterId: "technician-competence",
    slotName: "Technician Competence and Accreditation",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Technician Competence and Accreditation",
    generateGuidance: houseRules(
      "The qualifications and ongoing competence of the technicians attending site, and the accreditations the business holds. Name BPCA membership, CEPA certification, RSPH qualifications, CPD schemes or ISO standards ONLY where the evidence states them — accreditation claims are checkable and a wrong one is worse than none. Cover vetting where the setting calls for it.",
    ),
  },
  {
    chapterId: "records-reporting",
    slotName: "Records, Reporting and Due Diligence",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Records, Reporting and Due Diligence",
    generateGuidance: houseRules(
      "What is recorded at each visit, what the client receives and when, and how the records are kept available. Make the point that this documentation is the client's own due-diligence evidence — in a food or audited environment it is what demonstrates compliance to an inspector — so it is part of the service rather than paperwork around it. Cover trend reporting and contract review meetings where the evidence supports them.",
    ),
  },
  {
    chapterId: "health-safety-coshh",
    slotName: "Health, Safety and COSHH",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Health, Safety and COSHH",
    generateGuidance: houseRules(
      "Risk assessments and method statements, safe storage and handling of products under COSHH, secure placement of bait and monitoring points, and protection of non-target species, pets, children and vulnerable people on site. Where the evidence describes a residential or care setting, address safeguarding of residents directly.",
    ),
  },
  {
    chapterId: "legal-environmental",
    slotName: "Legal and Environmental Compliance",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Legal and Environmental Compliance",
    generateGuidance: houseRules(
      "The legal framework the work is carried out under and the environmental commitments that follow from it: responsible rodenticide use and stewardship, wildlife and protected-species obligations, and safe disposal of carcasses and waste. Keep to the obligations the evidence raises rather than listing legislation for its own sake.",
    ),
  },
  {
    chapterId: "proofing-works",
    slotName: "Proofing and Remedial Works",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Proofing and Remedial Works",
    generateGuidance: houseRules(
      "The physical works proposed to stop pests entering or harbouring — proofing entry points, netting or spiking for birds, removal of nests and fouling, and any cleaning or disinfection that follows. Describe what is included in this quote and what would be quoted separately." +
        onlyIf("the evidence mentions proofing, netting, bird control, nest removal or physical remedial works"),
    ),
  },
];
