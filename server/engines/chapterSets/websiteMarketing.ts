/**
 * Website & Digital Marketing chapter set — Delivery 2.14, Chunk 5.
 *
 * A DIFFERENT ANIMAL FROM THE OTHER TWO. Cleaning and pest control are
 * bought through formal tenders where the buyer publishes the sections
 * and scores each one. Web and marketing work is bought through a
 * persuasive sales proposal with no external structure imposed on it,
 * and the recurring failure is not a missing scored section — it is
 * ambiguity about scope, and about who owes what to whom.
 *
 * So this middle is built around the arguments that actually happen
 * after the work starts: what is a deliverable and what is not, how
 * many revision rounds are included, who supplies content, whether ad
 * spend is a fee, and who owns what at the end.
 *
 * ONE-OFF VERSUS RECURRING is the structural distinction, and it is
 * the same one the sector's trade preset makes for line items: a build
 * is a project, a retainer is a monthly service, and hosting is often
 * annual. Three conditional chapters keep a build-only or retainer-only
 * proposal from carrying chapters about work that is not in scope.
 */

import { type SlotDef, TABLE_GUIDANCE, houseRules, onlyIf } from "./spine";

export const WEBSITE_MARKETING_MIDDLE: Omit<SlotDef, "slotIndex">[] = [
  {
    chapterId: "approach-and-deliverables",
    slotName: "Proposed Approach and Deliverables",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Proposed Approach and Deliverables",
    generateGuidance: houseRules(
      "What is being delivered, stated concretely enough to settle an argument later: the work itself, and the specific outputs the client receives. Where the evidence quantifies something — page or template count, number of integrations, posts or campaigns per month, hours of a retainer — state that number. Where it names a platform or CMS, name it. Say plainly what is NOT included where the evidence makes that clear. Never promise a ranking, a traffic figure, a conversion rate or any other outcome.",
    ),
  },
  {
    chapterId: "design-build-process",
    slotName: "Design and Build Process",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Design and Build Process",
    generateGuidance: houseRules(
      "How the build runs from discovery through design, development, content population, testing and launch, and what the client sees and signs off at each stage. Cover the number of revision rounds included where the evidence gives it — that is a scope boundary, not a courtesy — and what happens beyond it. Cover accessibility and browser support where the evidence raises them." +
        onlyIf("the evidence includes website design, build, rebuild or migration work"),
    ),
  },
  {
    chapterId: "ongoing-marketing",
    slotName: "Ongoing Marketing Services",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Ongoing Marketing Services",
    generateGuidance: houseRules(
      "What the monthly retainer covers: the activities, their cadence, and what is produced each month. AD SPEND IS NOT A FEE — where the evidence gives a media budget, state clearly that it is paid to the platforms and is separate from the management fee, and never fold one into the other. Where the evidence distinguishes technical SEO, content and off-page work, keep them distinct." +
        onlyIf("the evidence includes an ongoing marketing, SEO, content or paid media retainer"),
    ),
  },
  {
    chapterId: "hosting-support",
    slotName: "Hosting, Support and Maintenance",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Hosting, Support and Maintenance",
    generateGuidance: houseRules(
      "The hosting arrangement, environments, SSL, backups and their frequency, software and plugin updates, security monitoring, and the support included each month. State uptime commitments, support hours and response times ONLY where the evidence gives them." +
        onlyIf("the evidence includes hosting, maintenance, support or a care plan"),
    ),
  },
  {
    chapterId: "measurement-reporting",
    slotName: "Measurement and Reporting",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Measurement and Reporting",
    generateGuidance: houseRules(
      "What is measured, how it is tracked, what the client receives and how often, and the review conversations that go with it. Describe what will be reported rather than what it will show: name the metrics, never predict their values, and make no claim about results.",
    ),
  },
  {
    chapterId: "timeline-milestones",
    slotName: "Timeline and Milestones",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Timeline and Milestones",
    generateGuidance: houseRules(
      "The phases of the work in order, what completes each one, and what the client is responsible for at each stage. Express durations only as the evidence gives them, and express everything relative to the start rather than against calendar dates — 'week one', 'following sign-off'. Never state when the work begins. " +
        TABLE_GUIDANCE +
        " A phase against its deliverable and its dependency is a good use of one.",
    ),
  },
  {
    chapterId: "what-we-need-from-you",
    slotName: "What We Need From You",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "What We Need From You",
    generateGuidance: houseRules(
      "What the client must supply for the work to run to plan: content and copy, images and assets, brand guidelines, access to domains, DNS, hosting and analytics, and the people who will approve work. CONTENT SUPPLY IS THE SINGLE LARGEST CAUSE OF A PROJECT SLIPPING, so where the evidence makes the client responsible for content, say so plainly and explain what happens to the schedule if it is late. Cover ownership of assets and source files on completion where the evidence addresses it.",
    ),
  },
];
