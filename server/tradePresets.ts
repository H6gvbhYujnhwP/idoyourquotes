/**
 * Trade Presets for Comprehensive Quotes
 * 
 * Each preset defines which sections are enabled, default configurations,
 * and AI prompts tailored to the specific trade sector.
 */

export const TRADE_PRESETS = {
  construction: {
    name: "Construction / Engineering / Steel",
    description: "For structural steel, construction, and engineering tender packages",
    sections: {
      coverLetter: { enabled: true, template: "construction_formal", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["requirements_review", "technical_review"],
      },
      technicalReview: {
        enabled: true,
        checklist: [
          "Product standard/specification verified",
          "Execution class confirmed",
          "Site/Workshop welding requirements",
          "Finishing requirements noted",
          "Inspection & Testing requirements",
          "Adequate workshop space",
          "Adequate equipment/plant",
          "Trained & qualified workforce",
          "Sub Contract works required identified",
        ],
      },
      drawings: {
        enabled: true,
        categories: ["Site Location Plans", "Structural Drawings", "Floor Plans", "Sections"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["Contract Preliminaries", "Employer Requirements", "Pre-Construction Info", "ITT Letters", "Specifications"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize construction/engineering documents into:
- Contract Preliminaries (contract terms, employer requirements)
- Specifications (technical specs, material requirements)
- Site Location Plans (site maps, location context)
- Structural Drawings (engineering drawings, structural plans)
- Floor Plans (building layouts, room arrangements)
- Pre-Construction Info (PCI, safety info, site constraints)
- ITT Letters (invitation to tender, cover letters)
- Trade Bills (BOQ, bills of quantities, pricing schedules)
- Other Supporting Documents`,
      lineItemExtraction: `Extract line items from construction documents. Focus on:

STRUCTURAL STEEL:
- Member descriptions: "Universal Beam 203x133x30kg/m - 2.20m long"
- Quantities and units (nr, tonnes, m, m²)
- Connection details
- Material grades (S275, S355)
- Finishing (shop primed, galvanized, painted)

From BOQ/Trade Bills:
- Extract each line item with: description, quantity, unit, rate
- Maintain groupings (e.g., "G12 Isolated structural metal members")
- Note exclusions and inclusions

From Specifications:
- Standards: BS EN 1090, NISS CE, execution class
- Material specifications
- Testing requirements`,
      timelineAnalysis: `Analyze construction/engineering project timeline:

PHASES TO SUGGEST:
1. **Pre-Construction** (design review, approvals, procurement)
   - Duration: 2-4 weeks typical
2. **Fabrication** (workshop production)
   - Calculate based on tonnage: ~5-10 tonnes per week
   - Complex connections add 20-30% time
3. **Surface Treatment** (painting, galvanizing)
   - Duration: 1-2 weeks after fabrication
4. **Delivery & Erection** (site installation)
   - Calculate based on tonnage: ~10-20 tonnes per day with crane
   - Weather contingency: add 10-15%
5. **Completion** (snagging, documentation, handover)
   - Duration: 1-2 weeks

FACTORS TO CONSIDER:
- Total tonnage of steelwork
- Complexity of connections
- Site access constraints
- Crane availability
- Weather sensitivity
- Coordination with other trades`,
    },
  },

  electrical: {
    name: "Electrical Installation",
    description: "For electrical installation, floor plans, and quantity takeoffs",
    sections: {
      coverLetter: { enabled: true, template: "electrical_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: { enabled: false, templates: [] },
      technicalReview: { enabled: false },
      drawings: {
        enabled: true,
        categories: ["Floor Plans", "Electrical Schematics", "Single Line Diagrams", "Cable Routes"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["Specifications", "Schedules", "Tender Documents"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize electrical installation documents into:
- Floor Plans (building layouts with electrical symbols)
- Electrical Schematics (circuit diagrams, wiring diagrams)
- Single Line Diagrams (power distribution)
- Cable Routes (containment, trunking, tray layouts)
- Specifications (electrical specs, standards)
- Schedules (lighting schedules, DB schedules, cable schedules)
- Tender Documents (ITT, pricing schedules)`,
      lineItemExtraction: `Extract electrical installation items:

SYMBOL COUNTING:
- Count electrical symbols from floor plans
- Socket outlets (single, double, switched, unswitched)
- Light fittings (types, quantities per room)
- Switches (1-gang, 2-gang, dimmer, PIR)
- Data points, TV points, telephone points
- Fire alarm devices (detectors, call points, sounders)
- Distribution boards

CABLE & CONTAINMENT:
- Cable types and lengths
- Trunking/tray runs and sizes
- Conduit runs

EQUIPMENT:
- Distribution boards (size, type)
- Consumer units
- Isolators, MCBs, RCDs
- Emergency lighting`,
      timelineAnalysis: `Analyze electrical installation timeline:

PHASES TO SUGGEST:
1. **First Fix** (rough-in before plaster)
   - Cable routes, conduits, back boxes, containment
   - Rate: 50-100m² per day per electrician (standard work)
   - Rate: 30-50m² per day for complex work
   - Duration: Floor area ÷ daily rate

2. **Second Fix** (final installation)
   - Sockets, switches, light fittings, accessories
   - Rate: 15-25 devices per day per electrician
   - Duration: Device count ÷ daily rate

3. **Distribution Equipment**
   - DB installation, terminations
   - Rate: 1-2 boards per day
   - Duration: Board count ÷ daily rate

4. **Testing & Commissioning**
   - Testing, certification, documentation
   - Rate: 10-15 circuits per day
   - Duration: Circuit count ÷ daily rate + 2 days documentation

PHASING BY AREA:
- If multi-floor: suggest floor-by-floor approach
- Identify critical areas (server rooms, data centers)
- Sequence for minimal disruption`,
    },
  },

  metalwork: {
    name: "Architectural Metalwork",
    description: "For bespoke metalwork, staircases, balustrades, gates, and fabrication",
    sections: {
      coverLetter: { enabled: true, template: "metalwork_bespoke", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: { enabled: false, templates: [] },
      technicalReview: { enabled: false },
      drawings: {
        enabled: true,
        categories: ["Concept Sketches", "Fabrication Drawings", "Site Photos", "Reference Images"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["Material Specifications", "Finish Specifications", "Client Brief"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize metalwork documents into:
- Concept Sketches (design intent, ideas)
- Fabrication Drawings (detailed drawings with dimensions)
- Site Photos (existing conditions, measurements)
- Reference Images (style references, examples)
- Material Specifications (metal types, finishes)
- Client Brief (requirements, preferences)`,
      lineItemExtraction: `Extract metalwork items and specifications:

ITEM TYPES:
- Staircases (straight, curved, spiral)
- Balustrades/Railings (glass, metal infill, wire)
- Gates (single, double, automated)
- Screens/Panels (perforated, laser-cut, mesh)
- Structural supports (posts, beams, brackets)
- Custom fabrications (bespoke items)

DIMENSIONS:
- Overall dimensions (L x W x H)
- Custom measurements (radii, angles, pitches)
- Panel sizes
- Spacing/pitch (baluster spacing, etc.)

MATERIALS:
- Metal types: stainless steel, mild steel, aluminum, brass, bronze
- Grades: 304, 316, marine grade
- Sections: tube, flat bar, angle, channel, RHS, etc.
- Infill: glass, mesh, rod, cable, panels

FINISHES:
- Surface finishes: polished, brushed, satin
- Coatings: powder coat (RAL colors), galvanize, paint
- Protective treatments: lacquer, wax

QUANTITIES:
- Linear meters (railings, handrails)
- Number of (gates, panels, posts)
- Square meters (screens, panels)`,
      timelineAnalysis: `Analyze metalwork fabrication timeline:

PHASES TO SUGGEST:
1. **Design & Approval**
   - Fabrication drawing preparation
   - Client approval
   - Duration: 1-2 weeks standard, 3-4 weeks complex/bespoke

2. **Material Procurement**
   - Standard stock: 1 week
   - Special sections: 2-4 weeks
   - Glass/infill panels: 2-3 weeks
   - Custom finishes: add 1-2 weeks

3. **Fabrication**
   Calculate based on item complexity:
   - Straight staircases: 2-3 weeks each
   - Curved/spiral stairs: 4-6 weeks each
   - Balustrades: 50-100 linear meters per week (standard)
   - Balustrades: 20-40 linear meters per week (complex)
   - Gates (standard): 1-2 weeks each
   - Gates (complex/automated): 3-4 weeks each

4. **Finishing**
   - Powder coating: 1-2 weeks (includes prep)
   - Polishing: add 3-5 days
   - Galvanizing: 1-2 weeks
   - Special finishes: 2-3 weeks

5. **Installation**
   - Calculate based on site complexity
   - Multi-floor work: add hoisting time
   - Complex fixing: add structural work time`,
    },
  },

  custom: {
    name: "Custom Configuration",
    description: "Build your own comprehensive quote structure for any trade",
    sections: {
      coverLetter: { enabled: true, templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: { enabled: false, templates: [] },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: false },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: false },
    aiPrompts: {
      documentCategorization: "Categorize documents based on their content and purpose.",
      lineItemExtraction: "Extract line items from documents including descriptions, quantities, units, and rates.",
      timelineAnalysis: "Analyze the project scope and suggest a realistic timeline with phases.",
    },
  },
} as const;

export type TradePresetKey = keyof typeof TRADE_PRESETS;
