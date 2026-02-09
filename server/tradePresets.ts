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
1. Pre-Construction (design review, approvals, procurement)
   - Duration: 2-4 weeks typical
2. Fabrication (workshop production)
   - Calculate based on tonnage: ~5-10 tonnes per week
   - Complex connections add 20-30% time
3. Surface Treatment (painting, galvanizing)
   - Duration: 1-2 weeks after fabrication
4. Delivery & Erection (site installation)
   - Calculate based on tonnage: ~10-20 tonnes per day with crane
   - Weather contingency: add 10-15%
5. Completion (snagging, documentation, handover)
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
1. First Fix (rough-in before plaster)
   - Cable routes, conduits, back boxes, containment
   - Rate: 50-100m² per day per electrician (standard work)
   - Rate: 30-50m² per day for complex work
   - Duration: Floor area / daily rate

2. Second Fix (final installation)
   - Sockets, switches, light fittings, accessories
   - Rate: 15-25 devices per day per electrician
   - Duration: Device count / daily rate

3. Distribution Equipment
   - DB installation, terminations
   - Rate: 1-2 boards per day
   - Duration: Board count / daily rate

4. Testing & Commissioning
   - Testing, certification, documentation
   - Rate: 10-15 circuits per day
   - Duration: Circuit count / daily rate + 2 days documentation

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
1. Design & Approval
   - Fabrication drawing preparation
   - Client approval
   - Duration: 1-2 weeks standard, 3-4 weeks complex/bespoke

2. Material Procurement
   - Standard stock: 1 week
   - Special sections: 2-4 weeks
   - Glass/infill panels: 2-3 weeks
   - Custom finishes: add 1-2 weeks

3. Fabrication
   Calculate based on item complexity:
   - Straight staircases: 2-3 weeks each
   - Curved/spiral stairs: 4-6 weeks each
   - Balustrades: 50-100 linear meters per week (standard)
   - Balustrades: 20-40 linear meters per week (complex)
   - Gates (standard): 1-2 weeks each
   - Gates (complex/automated): 3-4 weeks each

4. Finishing
   - Powder coating: 1-2 weeks (includes prep)
   - Polishing: add 3-5 days
   - Galvanizing: 1-2 weeks
   - Special finishes: 2-3 weeks

5. Installation
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

  // ─── NEW TRADE SECTORS ───────────────────────────────────────────

  building_maintenance: {
    name: "Building Maintenance / Facilities Management (FM)",
    description: "For reactive and planned maintenance works",
    sections: {
      coverLetter: { enabled: true, template: "fm_contract", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["service_overview", "sla_response_times", "scope_definition"],
      },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: {
        enabled: true,
        categories: ["Service Schedule", "Compliance Certificates", "Method Statements", "Risk Assessments"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: false },
    aiPrompts: {
      documentCategorization: `Categorize FM documents into:
- Service Schedules (PPM frequencies, checklists)
- SLA Documents (response times, escalation procedures)
- Compliance Requirements (H&S, insurance, certifications)
- Site Information (floor plans, asset registers)
- Pricing Schedules (call-out rates, materials markup)`,
      lineItemExtraction: `Extract FM service line items:

PLANNED MAINTENANCE (PPM):
- Monthly/quarterly/annual visits
- Scope per visit (inspections, testing, servicing)
- Materials included/excluded

REACTIVE MAINTENANCE:
- Response time categories (emergency, urgent, routine)
- Call-out charges
- Hourly rates (normal/out of hours)
- Materials pricing (cost + markup %)

COMPLIANCE:
- Statutory testing (PAT, emergency lighting, fire alarms)
- Certificates and documentation

GROUP BY:
- Planned Preventative Maintenance
- Reactive Maintenance
- Statutory Compliance
- Out of Scope Works`,
      timelineAnalysis: `FM contracts are ongoing service agreements. Focus on:

SERVICE STRUCTURE:
- Contract duration (typically 1-3 years)
- PPM visit schedule
- Response time commitments
- Reporting frequency

Do not create project timeline - instead summarize:
- Monthly/quarterly service visits
- Annual compliance testing schedule
- Reporting and review meetings`,
    },
  },

  commercial_cleaning: {
    name: "Commercial Cleaning",
    description: "For regular cleaning contracts and one-off deep cleans",
    sections: {
      coverLetter: { enabled: true, template: "cleaning_contract", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["site_areas", "schedule", "staffing"],
      },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: {
        enabled: true,
        categories: ["Site Plans", "COSHH Assessments", "Insurance Certificates", "Staff DBS"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: false },
    aiPrompts: {
      documentCategorization: `Categorize cleaning documents into:
- Site Floor Plans (areas to be cleaned, access routes)
- Cleaning Specifications (scope, frequencies, standards)
- COSHH Assessments (chemicals and safety)
- Insurance and Compliance (public liability, staff checks)`,
      lineItemExtraction: `Extract cleaning service line items:

REGULAR CLEANING:
- Area coverage (m² or rooms)
- Frequency (daily, weekly, monthly)
- Scope per visit (tasks included)
- Consumables included/excluded

DEEP CLEANING:
- One-off deep clean scope
- Specialized tasks (carpet cleaning, window cleaning)
- Equipment hire

STAFFING:
- Hours per visit
- Number of operatives
- Supervision requirements
- DBS/security clearance if needed

GROUP BY:
- Daily Cleaning
- Weekly Deep Clean
- Monthly Tasks
- Consumables`,
      timelineAnalysis: `Cleaning contracts are ongoing. Focus on:

SERVICE PATTERN:
- Daily visits (times and duration)
- Weekly/monthly tasks schedule
- Holiday cover arrangements
- Notice period

Do not create project timeline.`,
    },
  },

  general_construction: {
    name: "General Construction / Building",
    description: "For general building works, extensions, and refurbishments",
    sections: {
      coverLetter: { enabled: true, template: "construction_general", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["scope_by_package", "materials_labour"],
      },
      technicalReview: { enabled: true },
      drawings: {
        enabled: true,
        categories: ["Architectural Drawings", "Structural Plans", "Building Control", "Planning Permission"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize construction documents into:
- Architectural Drawings (floor plans, elevations, sections)
- Structural Details (foundation, beam, lintel schedules)
- Building Control Applications
- Planning Permission
- Specifications (materials, finishes, standards)`,
      lineItemExtraction: `Extract construction line items by work package:

GROUNDWORKS:
- Excavation (volume in m³)
- Foundations (linear meters or m²)
- Drainage (linear meters by diameter)

STRUCTURE:
- Brickwork/blockwork (m²)
- Steelwork (tonnage or linear meters)
- Concrete (m³)

ROOFING:
- Roof structure (m² of roof area)
- Coverings (tiles, slate, felt)
- Rainwater goods

FINISHES:
- Plastering (m²)
- Flooring (m² by type)
- Decoration (m²)

GROUP BY work package or trade.`,
      timelineAnalysis: `Analyze construction project timeline:

PHASES:
1. Groundworks (1-3 weeks)
   - Excavation and foundations
   - Drainage installation
   - Rate: 50-100m² foundations per week

2. Structure (4-8 weeks)
   - Brickwork/blockwork
   - Structural frame
   - Roof structure
   - Rate: 20-30m² brickwork per day per bricklayer

3. Weathertight (1-2 weeks)
   - Roof covering
   - Windows and doors
   - External waterproofing

4. First Fix (2-3 weeks)
   - Electrics, plumbing, heating
   - Insulation
   - Plastering prep

5. Second Fix (3-4 weeks)
   - Plastering
   - Kitchen/bathroom installation
   - Flooring and decoration

DEPENDENCIES:
- Planning permission approval
- Building control inspections
- Weather (roof works)
- Client selections (finishes)`,
    },
  },

  bathrooms_kitchens: {
    name: "Bathrooms & Kitchens",
    description: "For bathroom and kitchen installation projects",
    sections: {
      coverLetter: { enabled: true, template: "domestic_install", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: { enabled: false, templates: [] },
      technicalReview: { enabled: false },
      drawings: {
        enabled: true,
        categories: ["Design Layouts", "Plumbing Schematics", "Electrical Plans"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize bathroom/kitchen documents into:
- Design Layouts (floor plans, elevations, 3D renders)
- Product Specifications (units, worktops, appliances, sanitaryware)
- Plumbing Schematics (pipe runs, waste, water supply)
- Electrical Plans (socket positions, lighting, appliance connections)`,
      lineItemExtraction: `Extract bathroom/kitchen line items:

STRIP-OUT:
- Remove existing units/sanitaryware
- Waste disposal
- Making good

FIRST FIX:
- Plumbing (pipe work, waste runs)
- Electrical (circuits, sockets)
- Any building work (stud walls, doorways)

SUPPLY & INSTALL:
- Units and carcasses
- Worktops
- Appliances
- Sanitaryware and taps

FINISHES:
- Tiling (m² by area)
- Flooring
- Decoration
- Accessories

GROUP BY:
- Strip-out
- Building Works
- Plumbing & Electrical
- Supply & Install
- Finishes`,
      timelineAnalysis: `Analyze kitchen/bathroom installation timeline:

PHASES:
1. Strip-out (1-2 days)
   - Remove existing installation
   - Waste disposal

2. First Fix (2-3 days)
   - Plumbing rough-in
   - Electrical rough-in
   - Any building work

3. Installation (3-5 days kitchen, 2-3 days bathroom)
   - Fit units and worktops
   - Install appliances/sanitaryware
   - Rate: Standard kitchen 3-5 days, bathroom 2-3 days

4. Finishes (2-4 days)
   - Tiling
   - Flooring
   - Decoration
   - Snagging

TOTAL: Kitchen 8-14 days, Bathroom 6-10 days

DEPENDENCIES:
- Access to water and waste
- Product delivery (worktops often 2-3 weeks)
- Customer selections finalized`,
    },
  },

  windows_doors: {
    name: "Windows / Doors / Conservatories",
    description: "For window, door, and conservatory installations",
    sections: {
      coverLetter: { enabled: true, template: "fenestration_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["survey_assumptions", "product_schedule"],
      },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: {
        enabled: true,
        categories: ["Survey Reports", "Product Brochures", "FENSA Certificates", "Warranty Documents"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize windows/doors documents into:
- Survey Reports (measurements, opening types, existing conditions)
- Product Specifications (materials, glazing, colors, hardware)
- Building Control/FENSA requirements
- Warranty Information`,
      lineItemExtraction: `Extract windows/doors line items:

PRODUCT SCHEDULE:
- Windows (by size, type, opening style, glazing)
- Doors (external, internal, bi-fold, sliding)
- Conservatories (size, roof type, base)

INSTALLATION:
- Remove existing frames
- Install new units
- Making good (plaster, decoration)
- Waste disposal

COMPLIANCE:
- FENSA/Building Control certification
- Warranty registration

GROUP BY room or elevation.`,
      timelineAnalysis: `Analyze fenestration installation timeline:

PHASES:
1. Survey & Design (1 visit)
   - Measure and assess
   - Product selection

2. Manufacturing (3-6 weeks)
   - Standard UPVC: 3-4 weeks
   - Timber/aluminum: 4-6 weeks
   - Bespoke: 6-8 weeks

3. Installation (varies by scope)
   - Rate: 2-4 windows per day
   - Rate: 1-2 doors per day
   - Conservatory: 3-5 days

4. Making Good & Certification (1 day)
   - Internal finishing
   - FENSA certificate

DEPENDENCIES:
- Manufacturing lead time
- Weather (external work)
- Access and scaffolding`,
    },
  },

  pest_control: {
    name: "Pest Control",
    description: "For pest control inspections and treatments",
    sections: {
      coverLetter: { enabled: true, template: "pest_control", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["inspection_findings", "treatment_plan"],
      },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: {
        enabled: true,
        categories: ["Inspection Reports", "Treatment Records", "COSHH Data", "Guarantee Certificates"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize pest control documents into:
- Inspection Reports (pest identification, extent, entry points)
- Treatment Plans (methods, chemicals, safety measures)
- COSHH Assessments (chemical safety data)
- Guarantee Certificates`,
      lineItemExtraction: `Extract pest control line items:

INSPECTION:
- Initial survey and report
- Pest identification
- Extent of infestation

TREATMENT:
- Chemical treatments (type, area)
- Baiting programs (number of stations)
- Proofing works (sealing entry points)
- Follow-up visits

MONITORING:
- Ongoing monitoring visits
- Reporting and documentation

WARRANTY:
- Guarantee period
- Warranty conditions`,
      timelineAnalysis: `Analyze pest control treatment timeline:

PHASES:
1. Inspection (1 visit, same day or next day)
   - Site survey
   - Pest identification
   - Treatment plan

2. Initial Treatment (1-2 visits)
   - Chemical application or baiting
   - Proofing works if required

3. Follow-up Treatments (varies by pest)
   - Rodents: 3 visits over 3-4 weeks typical
   - Insects: 2-3 visits over 2-6 weeks
   - Birds: Ongoing deterrent maintenance

4. Guarantee Period (varies)
   - 6-12 months typical
   - Monitoring visits included

DEPENDENCIES:
- Pest species and extent
- Site cooperation (access, hygiene)
- Weather (some treatments weather-dependent)`,
    },
  },

  scaffolding: {
    name: "Scaffolding / Access Equipment",
    description: "For scaffolding hire and access equipment",
    sections: {
      coverLetter: { enabled: true, template: "scaffold_hire", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["scope_specification", "compliance_certification"],
      },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize scaffolding documents into:
- Site Plans (elevations, locations, access routes)
- Scaffold Designs (TG20 compliance, bespoke designs)
- Method Statements and Risk Assessments
- Handover Certificates`,
      lineItemExtraction: `Extract scaffolding line items:

SCAFFOLD STRUCTURE:
- Linear runs (meters)
- Lifts (number of levels)
- Width (boards wide)
- Ties and fixings

HIRE PERIOD:
- Erection charge
- Weekly/monthly hire
- Adaptations (if required)
- Dismantle charge

COMPLIANCE:
- Inspections (weekly)
- Handover certificate
- Loading calculations

ADDITIONAL:
- Sheeting/netting
- Covered walkways
- Alarm systems
- Lighting`,
      timelineAnalysis: `Analyze scaffolding hire timeline:

PHASES:
1. Design & Notifications (1-2 days)
   - Site survey
   - Design (TG20 or bespoke)
   - Licensing/notifications if required

2. Erection (varies by size)
   - Rate: 30-50 linear meters per day
   - Rate: Add 1 day per 3-4 lifts
   - Complexity factors (confined access, height)

3. Hire Period (as required)
   - Weekly inspections
   - Adaptations as needed

4. Dismantle (typically 60% of erection time)

WEATHER DEPENDENCIES:
- High winds delay erection/dismantle
- Allow contingency for weather delays`,
    },
  },

  mechanical_fabrication: {
    name: "Mechanical Engineering / Fabrication",
    description: "For mechanical fabrication, pipework, and ductwork",
    sections: {
      coverLetter: { enabled: true, template: "engineering_formal", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["technical_requirements", "quality_standards"],
      },
      technicalReview: { enabled: true },
      drawings: {
        enabled: true,
        categories: ["GA Drawings", "Fabrication Details", "Isometrics", "Weld Procedures"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize mechanical fabrication documents into:
- General Arrangement Drawings (layouts, elevations)
- Fabrication Details (weld details, material specs)
- Isometric Drawings (pipework routes)
- Specifications (materials, standards, testing)
- Quality Requirements (NDT, pressure testing)`,
      lineItemExtraction: `Extract mechanical fabrication line items:

MATERIALS:
- Pipework (diameter, schedule, material grade, length)
- Ductwork (size, gauge, linear meters)
- Fittings and flanges
- Support steelwork

FABRICATION:
- Welding (linear meters, joint count)
- Bending and forming
- Surface treatment

INSTALLATION:
- Site installation and fixing
- Testing and commissioning
- Insulation

COMPLIANCE:
- NDT requirements
- Pressure testing
- Certification`,
      timelineAnalysis: `Analyze mechanical fabrication timeline:

PHASES:
1. Design & Approval (2-4 weeks)
   - Detailed design
   - Material procurement
   - Client/engineer approval

2. Workshop Fabrication (varies)
   - Rate: Depends on complexity
   - Allow for NDT and rework
   - Surface treatment

3. Site Installation (varies)
   - Rate: Depends on size and access
   - Testing and commissioning

4. Handover (1 week)
   - Documentation
   - Training
   - O&M manuals`,
    },
  },

  fire_protection: {
    name: "Fire Stopping / Passive Fire Protection",
    description: "For fire stopping, cavity barriers, and passive fire protection",
    sections: {
      coverLetter: { enabled: true, template: "fire_protection", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["fire_strategy_compliance", "third_party_certification"],
      },
      technicalReview: { enabled: true },
      drawings: {
        enabled: true,
        categories: ["Fire Strategy Drawings", "Penetration Schedules", "Detail Drawings", "Test Certificates"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize fire protection documents into:
- Fire Strategy Documents (compartmentation, escape routes)
- Penetration Schedules (locations, sizes, services)
- Detail Drawings (fire stopping specifications)
- Test Certificates (third-party certification requirements)
- Product Data Sheets`,
      lineItemExtraction: `Extract fire protection line items:

FIRE STOPPING:
- Service penetrations (by size and type)
- Linear joint seals (linear meters)
- Cavity barriers
- Door and shutter upgrades

MATERIALS:
- Intumescent materials
- Fire-rated boards and batts
- Sealants and mastics

TESTING & CERTIFICATION:
- Third-party certification
- Test certificates
- Documentation and labeling

GROUP BY:
- Fire compartment or floor`,
      timelineAnalysis: `Analyze fire protection installation timeline:

PHASES:
1. Survey & Schedule (1-2 weeks)
   - Penetration survey
   - Detail design
   - Product selection

2. Installation (varies by scope)
   - Rate: 20-40 penetrations per day (varies by size/complexity)
   - Rate: 10-20 linear meters joint seals per day
   - Sequential by floor or area

3. Certification (1-2 weeks)
   - Third-party inspection
   - Certificate issue
   - Labeling complete

DEPENDENCIES:
- Services installation complete
- Building structure complete
- Access to all areas
- Sequential sign-off by compartment`,
    },
  },

  lifts_access: {
    name: "Lifts / Access Systems",
    description: "For lift installation and access equipment",
    sections: {
      coverLetter: { enabled: true, template: "lift_installation", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["system_specification", "compliance_requirements"],
      },
      technicalReview: { enabled: true },
      drawings: {
        enabled: true,
        categories: ["Lift Shaft Drawings", "Equipment Layouts", "Electrical Schematics", "LOLER Certificates"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize lift/access documents into:
- Lift Shaft Drawings (dimensions, pit, headroom)
- Equipment Specifications (capacity, speed, finishes)
- Electrical Requirements (power, controls)
- Compliance Certificates (LOLER, insurance inspections)`,
      lineItemExtraction: `Extract lift/access line items:

EQUIPMENT:
- Lift car and controls
- Machine room equipment
- Doors and landing equipment
- Finishes and fixtures

INSTALLATION:
- Shaft preparation
- Equipment installation
- Testing and commissioning

COMPLIANCE:
- LOLER examination
- Insurance inspection
- CE marking

WARRANTY & MAINTENANCE:
- Warranty period
- Maintenance contract (optional)`,
      timelineAnalysis: `Analyze lift installation timeline:

PHASES:
1. Design & Approvals (4-8 weeks)
   - Detailed design
   - Building control approval
   - Equipment procurement

2. Shaft Preparation (1-2 weeks)
   - Shaft checks and corrections
   - Electrical installation

3. Equipment Installation (2-4 weeks)
   - Machine room equipment
   - Car and doors installation
   - Rate: 2-4 weeks per lift (standard passenger)

4. Testing & Commissioning (1-2 weeks)
   - Factory testing
   - LOLER examination
   - Insurance inspection
   - Handover

DEPENDENCIES:
- Shaft construction complete
- Power supply available
- Access for delivery`,
    },
  },

  insulation_retrofit: {
    name: "Air Tightness / Insulation / Retrofit",
    description: "For insulation, air tightness, and retrofit energy efficiency projects",
    sections: {
      coverLetter: { enabled: true, template: "retrofit_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["survey_findings", "performance_targets"],
      },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: {
        enabled: true,
        categories: ["Air Tightness Reports", "Thermal Images", "Compliance Certificates", "EPC Ratings"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize insulation/retrofit documents into:
- Survey Reports (thermal imaging, air leakage testing)
- Energy Performance Certificates (existing and predicted)
- Product Specifications (insulation types, U-values)
- Compliance Documents (Building Regulations Part L)`,
      lineItemExtraction: `Extract insulation/retrofit line items:

INSULATION:
- Loft insulation (m², depth, material)
- Cavity wall insulation (m²)
- Internal/external wall insulation (m²)
- Floor insulation (m²)

AIR TIGHTNESS:
- Sealing works (linear meters or per item)
- Ventilation upgrades
- Air tightness testing

GLAZING/DOORS:
- Secondary glazing
- Door upgrades

TESTING:
- Air tightness testing
- Thermal imaging
- Post-works EPC`,
      timelineAnalysis: `Analyze retrofit installation timeline:

PHASES:
1. Survey & Assessment (1 week)
   - Air tightness test (pre-works)
   - Thermal imaging
   - Design and specification

2. Installation (varies)
   - Loft insulation: 1-2 days typical house
   - Cavity wall: 1 day injection
   - Internal wall insulation: 1-2 weeks
   - External wall insulation: 2-4 weeks

3. Testing & Certification (1-2 days)
   - Air tightness test (post-works)
   - EPC rating
   - Handover documentation

DEPENDENCIES:
- Weather (external works)
- Occupancy (working around residents)
- Asbestos surveys (older properties)`,
    },
  },

  plumbing: {
    name: "Plumbing & Drainage",
    description: "For plumbing installations and drainage works",
    sections: {
      coverLetter: { enabled: true, template: "plumbing_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["scope_by_system", "materials_schedule"],
      },
      technicalReview: { enabled: false },
      drawings: {
        enabled: true,
        categories: ["Plumbing Schematics", "Drainage Layouts", "Isometrics"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize plumbing documents into:
- Plumbing Schematics (hot/cold water, heating pipework)
- Drainage Layouts (above/below ground drainage)
- Equipment Specifications (boilers, cylinders, sanitaryware)
- Material Schedules (pipe sizes, fittings)`,
      lineItemExtraction: `Extract plumbing line items:

ABOVE GROUND DRAINAGE:
- Soil and waste pipework (diameter, linear meters)
- Sanitaryware connections

BELOW GROUND DRAINAGE:
- Drains (diameter, linear meters, depth)
- Inspection chambers and manholes
- Connection to sewer/septic

HOT & COLD WATER:
- Distribution pipework (linear meters by diameter)
- Hot water cylinder/system
- Sanitaryware supply

HEATING:
- Boiler/heat source
- Radiators and pipework
- Controls

GROUP BY:
- Drainage
- Hot & Cold Water
- Heating`,
      timelineAnalysis: `Analyze plumbing installation timeline:

PHASES:
1. Below Ground Drainage (if applicable)
   - Rate: 10-20 linear meters per day
   - Testing before backfill

2. First Fix (rough-in)
   - Rate: 1-2 bathrooms per day (pipework only)
   - Heating pipework
   - Duration: Depends on property size

3. Equipment Installation
   - Boiler installation: 1-2 days
   - Cylinder installation: 0.5-1 day

4. Second Fix
   - Sanitaryware installation
   - Radiator hanging
   - Rate: 1 bathroom per day

5. Testing & Commissioning
   - Pressure testing
   - Gas safe certification (if applicable)
   - System commissioning

DEPENDENCIES:
- Building structure complete
- Drainage connections available
- Gas supply (if required)`,
    },
  },

  hvac: {
    name: "HVAC (Heating, Ventilation, Air Conditioning)",
    description: "For HVAC installation and maintenance",
    sections: {
      coverLetter: { enabled: true, template: "hvac_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["system_design", "equipment_schedule"],
      },
      technicalReview: { enabled: true },
      drawings: {
        enabled: true,
        categories: ["Ductwork Layouts", "Equipment Schedules", "Control Schematics"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize HVAC documents into:
- System Design Calculations (heat loss, cooling loads, airflow)
- Ductwork Layouts (routes, sizes, diffuser positions)
- Equipment Schedules (AHUs, FCUs, condensers, boilers)
- Control Schematics (BMS, controls, sensors)`,
      lineItemExtraction: `Extract HVAC line items:

EQUIPMENT:
- Air handling units (capacity, features)
- Fan coil units (quantity, capacity)
- Condensing units / chillers
- Boilers / heat pumps

DUCTWORK:
- Supply and extract ductwork (m² or kg)
- Diffusers and grilles
- Volume control dampers
- Insulation

PIPEWORK:
- Heating/chilled water pipework (linear meters)
- Refrigerant pipework
- Condensate drainage

CONTROLS:
- BMS system
- Thermostats and sensors
- Commissioning

GROUP BY:
- Equipment
- Ductwork
- Pipework
- Controls & Commissioning`,
      timelineAnalysis: `Analyze HVAC installation timeline:

PHASES:
1. Design & Approvals (2-4 weeks)
   - Detailed design
   - Calculations and selections
   - Building control notifications

2. Equipment Procurement (4-8 weeks)
   - Lead times vary by equipment
   - Large AHUs: 8-12 weeks
   - Standard FCUs: 4-6 weeks

3. First Fix (ductwork and pipework)
   - Rate: 50-100 kg ductwork per day
   - Rate: 20-30 linear meters pipework per day

4. Equipment Installation (1-3 weeks)
   - Plant room equipment
   - Terminal units

5. Commissioning (1-2 weeks)
   - System balancing
   - Controls programming
   - Testing and handover

DEPENDENCIES:
- Building structure complete
- Power supply available
- Coordination with other trades`,
    },
  },

  roofing: {
    name: "Roofing & Cladding",
    description: "For roofing, cladding, and rainwater systems",
    sections: {
      coverLetter: { enabled: true, template: "roofing_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["scope_by_area", "materials_schedule"],
      },
      technicalReview: { enabled: false },
      drawings: {
        enabled: true,
        categories: ["Roof Plans", "Elevations", "Details", "Structural Calculations"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize roofing documents into:
- Roof Plans (layouts, pitches, areas)
- Elevations (cladding details, finishes)
- Detail Drawings (eaves, verges, junctions)
- Structural Calculations (wind loads, structural capacity)
- Material Specifications`,
      lineItemExtraction: `Extract roofing line items:

ROOF STRUCTURE:
- Roof trusses or rafters (if included)
- Purlins and battens
- OSB/plywood decking (m²)

COVERINGS:
- Roof tiles/slates (m², including wastage)
- Flat roofing membrane (m²)
- Insulation (m², U-value)

RAINWATER:
- Gutters (linear meters)
- Downpipes (linear meters)
- Gullies and connections

FLASHINGS & DETAILS:
- Ridge and hip tiles
- Valleys and flashings
- Soffits and fascias

GROUP BY:
- Roof area or elevation`,
      timelineAnalysis: `Analyze roofing installation timeline:

PHASES:
1. Strip-off (if re-roof)
   - Rate: 100-150m² per day
   - Waste disposal

2. Roof Structure (if new build)
   - Rate: 50-100m² per day

3. Covering Installation
   - Pitched roof tiles: 30-50m² per day
   - Flat roof membrane: 50-100m² per day
   - Rate varies by complexity and pitch

4. Rainwater & Finishes (1-2 days)
   - Gutters and downpipes
   - Soffits and fascias

WEATHER DEPENDENCIES:
- Heavily weather-dependent
- Allow 30-40% contingency for delays
- Cannot work in rain, high winds, ice

DEPENDENCIES:
- Scaffolding in place
- Materials delivered
- Weather forecast favorable`,
    },
  },

  joinery: {
    name: "Joinery & Carpentry",
    description: "For joinery manufacture and carpentry installation",
    sections: {
      coverLetter: { enabled: true, template: "joinery_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["design_specifications", "materials_schedule"],
      },
      technicalReview: { enabled: false },
      drawings: {
        enabled: true,
        categories: ["Joinery Drawings", "Elevations", "Details"],
      },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize joinery documents into:
- Joinery Drawings (elevations, sections, details)
- Material Specifications (timber species, finishes, ironmongery)
- Setting Out Drawings (site dimensions)`,
      lineItemExtraction: `Extract joinery line items:

FIRST FIX CARPENTRY:
- Floor joists (linear meters)
- Roof structure (if applicable)
- Studwork and partitions (m²)
- Door linings

BESPOKE JOINERY:
- Staircases (number, type)
- Built-in furniture (linear meters or units)
- Paneling (m²)
- Feature joinery items

SECOND FIX:
- Door hanging (number)
- Skirting and architrave (linear meters)
- Shelving and accessories

IRONMONGERY:
- Hinges, locks, handles
- Specialty hardware

GROUP BY:
- First Fix
- Joinery Manufacture
- Second Fix & Installation`,
      timelineAnalysis: `Analyze joinery installation timeline:

PHASES:
1. Design & Approval (1-2 weeks)
   - Detailed drawings
   - Material selection
   - Client approval

2. Manufacture (varies)
   - Standard joinery: 2-4 weeks
   - Bespoke/complex: 4-8 weeks
   - Staircase: 4-6 weeks typical

3. First Fix Installation (if applicable)
   - Rate: 20-30m² studwork per day
   - Rate: 15-20 linear meters floor joists per day

4. Second Fix Installation
   - Rate: 10-15 doors hung per day
   - Rate: 30-50 linear meters skirting per day
   - Bespoke items: assess individually

DEPENDENCIES:
- Building structure complete
- Services first fix complete (for studwork)
- Site measurements taken
- Materials delivered`,
    },
  },

  painting: {
    name: "Painting & Decorating",
    description: "For painting and decorating projects",
    sections: {
      coverLetter: { enabled: true, template: "decorating_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["scope_by_area", "surface_preparation"],
      },
      technicalReview: { enabled: false },
      drawings: { enabled: false },
      supportingDocs: { enabled: false },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: false },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize painting documents into:
- Floor Plans (rooms and areas)
- Specifications (paint types, colors, finishes, coats)
- Surface Schedules (wall finishes, preparation required)`,
      lineItemExtraction: `Extract painting line items:

PREPARATION:
- Filling and making good
- Sanding
- Sugar soaping
- Priming/sealing

PAINTING:
- Walls (m², paint type, coats)
- Ceilings (m², paint type, coats)
- Woodwork (linear meters or items, undercoat/gloss)
- Metalwork (m² or items)

WALLPAPERING:
- Wall covering (m², type)
- Paper hanging

SPECIALIST FINISHES:
- Feature walls
- Spray finishing
- Specialist coatings

GROUP BY:
- Room or area`,
      timelineAnalysis: `Analyze painting installation timeline:

PHASES:
1. Preparation (30-40% of total time)
   - Filling and sanding
   - Priming/sealing
   - Protection and masking

2. First Coat (walls and ceilings)
   - Rate: 80-120m² per day per decorator

3. Second Coat (walls and ceilings)
   - Rate: 100-150m² per day per decorator

4. Woodwork (undercoat and gloss)
   - Rate: 20-30 linear meters per day
   - 2 coats minimum

5. Final Inspection & Touch-ups (0.5-1 day)

DEPENDENCIES:
- Plastering complete and dry
- All other trades finished
- Adequate ventilation and heating
- Room-by-room sequential access`,
    },
  },
  it_services: {
    name: "IT Services / MSP",
    description: "For managed service providers, IT support contracts, and infrastructure projects",
    sections: {
      coverLetter: { enabled: true, template: "it_services_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["scope_of_services", "sla_requirements"],
      },
      technicalReview: {
        enabled: true,
        checklist: [
          "Current infrastructure assessed",
          "Network topology documented",
          "Licensing requirements identified",
          "Backup and disaster recovery scope",
          "Security requirements (firewall, endpoint, MFA)",
          "Cloud vs on-premise decision",
          "User count and device count confirmed",
          "SLA response times agreed",
          "Third-party vendor dependencies identified",
          "Data migration requirements",
        ],
      },
      drawings: {
        enabled: true,
        categories: ["Network Diagrams", "Rack Layouts", "Floor Plans (cable routes)", "Logical Diagrams"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["ITT / RFP Documents", "Current Asset Registers", "SLA Documents", "Security Policies", "Specifications"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize IT services documents into:
- ITT / RFP Documents (invitation to tender, request for proposal)
- Network Diagrams (topology, rack layouts, logical diagrams)
- Asset Registers (hardware lists, software inventories)
- SLA Documents (service level agreements, response times)
- Security Policies (acceptable use, backup policies)
- Specifications (technical requirements, infrastructure specs)
- Floor Plans (cable routes, server room layouts)`,
      lineItemExtraction: `Extract IT services line items:

HARDWARE:
- Servers (make, model, specification, quantity)
- Switches, routers, firewalls (make, model, port count)
- Workstations, laptops, monitors
- UPS and power distribution
- Cabling (Cat6/6a/fibre, linear meters, terminations)

SOFTWARE & LICENSING:
- Operating system licences
- Microsoft 365 / Google Workspace licences
- Security software (endpoint, firewall subscriptions)
- Backup software licences
- Line-of-business applications

SERVICES:
- Installation and configuration (hours/days)
- Data migration
- User setup and training
- Ongoing managed support (per user/per device/per month)
- Monitoring and alerting

GROUP BY:
- Hardware
- Software & Licensing
- Professional Services
- Managed Services (recurring)`,
      timelineAnalysis: `Analyze IT project timeline:

PHASES:
1. Discovery & Audit
   - Current infrastructure audit: 1-3 days
   - Requirements gathering: 1-2 days
   - Solution design: 2-5 days

2. Procurement
   - Hardware lead times: 1-4 weeks
   - Licensing procurement: 1-5 days

3. Build & Configuration
   - Server build and config: 2-5 days per server
   - Network equipment config: 1-3 days
   - Cabling installation: depends on scale

4. Migration
   - Data migration: 1-5 days (depends on volume)
   - Email migration: 1-3 days
   - Application migration: varies

5. User Deployment
   - Workstation deployment: 10-20 per day
   - User training: 0.5-1 day per group

6. Handover & Go-Live
   - Testing and snagging: 1-2 days
   - Documentation handover
   - Hypercare period: 1-2 weeks

DEPENDENCIES:
- Client sign-off on design
- Hardware delivery
- Access to existing systems
- Out-of-hours migration windows`,
    },
  },

  groundworks: {
    name: "Groundworks & Civil Engineering",
    description: "For excavation, foundations, drainage, and civil engineering works",
    sections: {
      coverLetter: { enabled: true, template: "groundworks_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["site_assessment", "ground_conditions"],
      },
      technicalReview: {
        enabled: true,
        checklist: [
          "Ground investigation report reviewed",
          "Foundation design confirmed",
          "Service locations identified (gas, water, electric, telecoms)",
          "Drainage strategy confirmed",
          "Spoil disposal arrangements",
          "Dewatering requirements assessed",
          "Temporary works design (if required)",
          "Traffic management plan",
          "Environmental constraints (contamination, water table)",
        ],
      },
      drawings: {
        enabled: true,
        categories: ["Site Plans", "Foundation Drawings", "Drainage Layouts", "Sections & Levels", "Setting Out Drawings"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["Ground Investigation Reports", "Structural Engineer Calcs", "Specifications", "Contract Preliminaries", "Environmental Reports"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize groundworks documents into:
- Site Plans (location plans, site layouts)
- Foundation Drawings (strip, trench fill, pad, piled)
- Drainage Layouts (foul and surface water)
- Sections & Levels (cross sections, reduced levels)
- Ground Investigation Reports (bore holes, trial pits)
- Structural Engineer Calcs (foundation design)
- Specifications (earthworks, concrete, drainage specs)
- Environmental Reports (contamination, ecology)`,
      lineItemExtraction: `Extract groundworks line items:

SITE PREPARATION:
- Site clearance and strip topsoil (m²)
- Tree removal / grubbing out
- Temporary fencing and hoarding
- Site compound setup

EXCAVATION:
- Reduced level excavation (m³)
- Foundation excavation (m³, depth)
- Disposal of spoil (m³, on-site or off-site)
- Imported fill material (m³, type)

FOUNDATIONS:
- Concrete foundations (m³, mix, type: strip/trench fill/pad)
- Reinforcement (tonnes)
- Blinding concrete
- Formwork

DRAINAGE:
- Foul drainage (linear meters, diameter, depth)
- Surface water drainage (linear meters, diameter)
- Manholes and inspection chambers (nr, depth)
- Soakaways / attenuation (volume)
- Connection to mains

HARDSTANDINGS:
- Sub-base (m², thickness, type)
- Concrete slabs (m², thickness)
- Kerbing (linear meters)

GROUP BY:
- Site Preparation
- Excavation & Earthworks
- Foundations
- Below Ground Drainage
- External Works`,
      timelineAnalysis: `Analyze groundworks timeline:

PHASES:
1. Site Setup & Clearance
   - Site compound: 1-2 days
   - Topsoil strip: rate depends on area
   - Service diversions: 1-2 weeks lead time

2. Excavation
   - Reduced level dig: 50-200m³ per day (machine dependent)
   - Foundation trenches: 20-50 linear meters per day
   - Weather dependent - rain stops play

3. Foundations
   - Concrete pour: plan around batching plant availability
   - Curing time: minimum 3-7 days before loading
   - Strip footings: 20-30 linear meters per day

4. Below Ground Drainage
   - Rate: 15-30 linear meters per day
   - Manholes: 1-2 per day
   - Testing before backfill

5. Backfill & External Works
   - Backfill and compaction
   - Sub-base and hardstandings
   - Final levels and topsoil

DEPENDENCIES:
- Ground investigation complete
- Building control approval
- Service locations confirmed
- Weather conditions (frost, heavy rain)`,
    },
  },

  fire_security: {
    name: "Fire & Security Systems",
    description: "For fire alarm, detection, suppression, CCTV, access control, and intruder alarm installations",
    sections: {
      coverLetter: { enabled: true, template: "fire_security_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["system_design_review", "compliance_checklist"],
      },
      technicalReview: {
        enabled: true,
        checklist: [
          "Fire risk assessment reviewed",
          "Detection category confirmed (L1-L5, P1-P2)",
          "Cause and effect matrix prepared",
          "CCTV coverage areas identified",
          "Access control door schedule confirmed",
          "Intruder alarm grade confirmed (Grade 1-4)",
          "Cable route survey completed",
          "Integration requirements (BMS, lift recall, AOV)",
          "Monitoring station requirements",
          "Maintenance contract scope",
        ],
      },
      drawings: {
        enabled: true,
        categories: ["Fire Alarm Layouts", "CCTV Layouts", "Access Control Layouts", "Cable Route Drawings", "Floor Plans"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["Fire Risk Assessments", "System Specifications", "Cause & Effect Matrices", "Door Schedules", "Compliance Standards"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize fire & security documents into:
- Fire Alarm Layouts (detector positions, sounder positions, call points)
- CCTV Layouts (camera positions, coverage areas)
- Access Control Layouts (door positions, reader locations)
- Cable Route Drawings (containment, cable runs)
- Fire Risk Assessments
- System Specifications (BS 5839, BS EN 50131, BS EN 62676)
- Cause & Effect Matrices (fire alarm logic)
- Door Schedules (access control)`,
      lineItemExtraction: `Extract fire & security line items:

FIRE DETECTION & ALARM:
- Control panel (type, zones/loops)
- Detectors by type (smoke, heat, multi-sensor) and quantity
- Manual call points (nr)
- Sounders and beacons (nr)
- Interface units (nr, purpose)
- Cabling (fire rated, standard - linear meters)

CCTV:
- Cameras by type (dome, bullet, PTZ) and resolution
- NVR/DVR (channels, storage)
- Monitors
- Cabling (Cat6, fibre - linear meters)

ACCESS CONTROL:
- Controllers (nr, doors per controller)
- Readers (nr, type: proximity, biometric)
- Maglocks / strikes (nr)
- Door entry panels (nr)

INTRUDER ALARM:
- Control panel (grade, zones)
- PIR detectors (nr)
- Door contacts (nr)
- Keypads (nr)
- Signalling (dual path, monitored)

GROUP BY:
- Fire Detection & Alarm
- CCTV
- Access Control
- Intruder Alarm
- Cabling & Containment`,
      timelineAnalysis: `Analyze fire & security installation timeline:

PHASES:
1. Design & Approval
   - System design: 2-5 days
   - Client/consultant approval: 1-2 weeks
   - Equipment procurement: 2-4 weeks

2. First Fix (Cabling)
   - Containment installation
   - Cable pulling: rate depends on building size
   - Typically 50-100 cable drops per day with team

3. Second Fix (Devices)
   - Detector/device installation: 20-40 per day
   - Camera installation: 8-15 per day
   - Access control hardware: 4-8 doors per day

4. Panel & Head-End
   - Panel installation and programming: 1-3 days
   - NVR setup and camera config: 1-2 days
   - Access control server setup: 1-2 days

5. Commissioning
   - Fire alarm commissioning: 1-2 days
   - CCTV commissioning: 1 day
   - Access control commissioning: 1 day
   - Cause and effect testing

6. Certification & Handover
   - BS 5839 certificate
   - As-built drawings
   - O&M manuals
   - User training: 0.5-1 day

DEPENDENCIES:
- Ceiling grids installed (for detectors)
- Doors hung (for access control)
- Power supply available
- Network infrastructure (for IP systems)`,
    },
  },

  telecoms_cabling: {
    name: "Telecoms / Data Cabling",
    description: "For structured cabling, fibre optic, telecoms infrastructure, and network installations",
    sections: {
      coverLetter: { enabled: true, template: "telecoms_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["cabling_specification", "testing_requirements"],
      },
      technicalReview: {
        enabled: true,
        checklist: [
          "Cable specification confirmed (Cat5e/6/6a/7, fibre type)",
          "Outlet quantities and locations confirmed",
          "Containment route survey completed",
          "Comms room / cabinet locations confirmed",
          "Patch panel and switch port counts",
          "Fibre backbone requirements",
          "Testing standard confirmed (ISO 11801, TIA-568)",
          "Labelling convention agreed",
          "As-built drawing requirements",
          "Warranty requirements (25-year system warranty)",
        ],
      },
      drawings: {
        enabled: true,
        categories: ["Floor Plans (outlet positions)", "Containment Routes", "Comms Room Layouts", "Riser Diagrams", "Schematic Drawings"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["Cabling Specifications", "Testing Standards", "Equipment Schedules", "ITT Documents", "Manufacturer Data Sheets"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize telecoms/cabling documents into:
- Floor Plans (outlet positions, furniture layouts)
- Containment Routes (tray, basket, conduit runs)
- Comms Room Layouts (cabinet positions, power)
- Riser Diagrams (vertical backbone routes)
- Cabling Specifications (cable types, testing standards)
- Equipment Schedules (patch panels, cabinets, switches)
- ITT Documents (tender requirements)`,
      lineItemExtraction: `Extract telecoms/cabling line items:

COPPER CABLING:
- Data outlets (Cat5e/6/6a, single/double, quantity)
- Cable runs (linear meters, cable type)
- Patch panels (port count, quantity)
- Patch leads (length, quantity)

FIBRE OPTIC:
- Fibre cables (type: OM3/OM4/OS2, core count, linear meters)
- Fibre terminations (type: LC/SC, quantity)
- Fibre patch panels (quantity)
- Splice enclosures

CONTAINMENT:
- Cable tray (width, linear meters)
- Cable basket (width, linear meters)
- Conduit (diameter, linear meters)
- Floor boxes (quantity)
- Dado trunking (linear meters)

CABINETS & COMMS ROOMS:
- Server/network cabinets (size: 12U/24U/42U, quantity)
- Power distribution (PDU quantity)
- Cabinet accessories (shelves, blanking panels)

TESTING & CERTIFICATION:
- Copper testing (per link)
- Fibre testing (per link, OTDR)
- Certification and documentation

GROUP BY:
- Copper Cabling
- Fibre Optic
- Containment
- Cabinets & Infrastructure
- Testing & Certification`,
      timelineAnalysis: `Analyze telecoms/cabling installation timeline:

PHASES:
1. Survey & Design
   - Site survey: 1-2 days
   - Design and drawing: 2-5 days
   - Approval: 1 week

2. Containment Installation
   - Cable tray/basket: 30-60 linear meters per day
   - Conduit: 20-40 linear meters per day
   - Floor boxes: 10-20 per day

3. Cable Installation
   - Cable pulling: 30-60 drops per day (team of 2)
   - Fibre blowing/pulling: 100-300m per day

4. Termination
   - Copper termination: 30-50 outlets per day
   - Fibre splicing: 20-40 fibres per day
   - Patch panel termination

5. Cabinet Build
   - Cabinet assembly and fitout: 1-2 per day
   - Patch lead dressing

6. Testing & Certification
   - Copper testing: 50-80 links per day (Fluke tester)
   - Fibre testing: 30-50 links per day
   - Documentation and as-builts: 1-2 days

DEPENDENCIES:
- Ceiling grid installed (for above-ceiling routes)
- Raised floor access (for floor void routes)
- Comms room power and cooling
- Builder's work holes cored`,
    },
  },

  solar_ev: {
    name: "Solar / EV Charging",
    description: "For solar PV installations, battery storage, and electric vehicle charging infrastructure",
    sections: {
      coverLetter: { enabled: true, template: "solar_ev_standard", templates: [] },
      tradeBill: { enabled: true, format: "table" as const, templates: [] },
      reviewForms: {
        enabled: true,
        templates: ["site_survey", "grid_connection"],
      },
      technicalReview: {
        enabled: true,
        checklist: [
          "Roof survey / structural assessment completed",
          "Shading analysis performed",
          "DNO application submitted / G99 notification",
          "Grid connection capacity confirmed",
          "Panel layout and string design confirmed",
          "Inverter sizing and selection",
          "Battery storage sizing (if applicable)",
          "EV charger specification confirmed",
          "Electrical supply capacity adequate",
          "Planning permission (if required)",
          "MCS certification requirements",
        ],
      },
      drawings: {
        enabled: true,
        categories: ["Roof Plans (panel layout)", "Electrical Schematics", "String Diagrams", "Site Plans", "EV Charging Layouts"],
      },
      supportingDocs: {
        enabled: true,
        categories: ["Structural Reports", "DNO Applications", "Shading Reports", "Product Data Sheets", "Planning Documents"],
      },
      siteRequirements: { enabled: true },
      qualityCompliance: { enabled: true },
    },
    timeline: { enabled: true },
    aiPrompts: {
      documentCategorization: `Categorize solar/EV documents into:
- Roof Plans (panel layouts, orientation, tilt)
- Electrical Schematics (AC/DC wiring, inverter connections)
- String Diagrams (panel string configurations)
- Site Plans (cable routes, inverter/battery locations)
- EV Charging Layouts (charger positions, cable routes)
- Structural Reports (roof loading calculations)
- DNO Applications (G99 forms, grid connection)
- Shading Reports (horizon analysis, yield predictions)
- Product Data Sheets (panels, inverters, batteries, chargers)`,
      lineItemExtraction: `Extract solar/EV line items:

SOLAR PV:
- Solar panels (make, model, wattage, quantity)
- Mounting system (roof type: pitched/flat, quantity)
- Inverter (make, model, kW rating, quantity)
- DC cabling (linear meters)
- AC cabling (linear meters)
- DC isolators and connectors
- AC isolator and consumer unit
- Generation meter

BATTERY STORAGE:
- Battery units (make, model, kWh, quantity)
- Battery inverter/hybrid inverter
- Associated cabling and switchgear

EV CHARGING:
- EV chargers (make, model, kW rating, quantity)
- Mounting posts / wall brackets
- Supply cabling (linear meters, cable size)
- Distribution board / sub-main
- Earthing (earth rod, bonding)
- Signage and bay markings

BALANCE OF SYSTEM:
- Scaffolding / access equipment
- Roof penetration weatherproofing
- Containment (tray, conduit)
- Labelling

GROUP BY:
- Solar PV
- Battery Storage
- EV Charging
- Electrical Infrastructure
- Access & Ancillaries`,
      timelineAnalysis: `Analyze solar/EV installation timeline:

PHASES:
1. Survey & Design
   - Site survey and shading analysis: 1-2 days
   - System design: 2-5 days
   - DNO application: 4-12 weeks (G99 dependent)
   - Structural assessment: 1-2 weeks

2. Procurement
   - Panel and inverter lead time: 1-3 weeks
   - Battery lead time: 2-6 weeks
   - EV charger lead time: 1-3 weeks

3. Scaffolding / Access
   - Scaffold erection: 1-2 days (domestic), 3-5 days (commercial)

4. Solar Installation
   - Mounting system: 1-2 days (domestic), 3-10 days (commercial)
   - Panel installation: 1-2 days (domestic), 3-10 days (commercial)
   - DC wiring: 0.5-1 day (domestic), 2-5 days (commercial)

5. Electrical
   - Inverter and battery installation: 1-2 days
   - AC wiring and consumer unit: 0.5-1 day
   - EV charger installation: 0.5-1 day per charger

6. Commissioning & Certification
   - System commissioning: 0.5-1 day
   - MCS certification
   - DNO notification of completion
   - EPC update (if applicable)
   - Handover and user training

DEPENDENCIES:
- DNO approval (critical path for larger systems)
- Scaffolding availability
- Roof condition adequate
- Electrical supply capacity`,
    },
  },
} as const;

export type TradePresetKey = keyof typeof TRADE_PRESETS;
