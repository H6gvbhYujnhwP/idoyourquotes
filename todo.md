# IdoYourQuotes - Project TODO

Based on Formal Build Prompt & Product Roadmap

---

## Phase 1 - MVP Quote Engine (CURRENT)

### Core Infrastructure
- [x] PostgreSQL database with all 7 tables
- [x] Standalone email/password authentication
- [x] JWT session management
- [x] Production deployment on Render

### Landing Page & Branding
- [x] Professional landing page with "We do your quotes" messaging
- [x] 4-step pipeline visual (Inputs → Interpretation → Internal → Quote)
- [x] Trust signals and CTA sections

### Quote Workspace (4-Tab Pipeline)
- [x] Tab 1: Inputs - UI for upload areas (PDF, Image, Audio, Email/Text)
- [x] Tab 2: Interpretation - Symbol mappings, assumptions, locked fields UI
- [x] Tab 3: Internal Estimate - Private notes, risk notes, cost assumptions UI
- [x] Tab 4: Quote - Client details, line items, totals, terms UI
- [x] Line items CRUD with calculations
- [x] Quote totals calculation

### File Upload (S3 Storage)
- [x] Implement S3 file upload for PDF documents
- [x] Implement S3 file upload for images/drawings
- [x] Implement S3 file upload for audio recordings
- [x] Store file references in quote_inputs table
- [x] Display uploaded files in Inputs tab

### PDF Generation
- [x] Company logo upload to R2 storage
- [x] Generate professional PDF quote output
- [x] Include company logo, details, client info, line items, totals, terms
- [x] Download PDF functionality
- [x] Clean, confident, professional design (no AI language)

### Quote Status Workflow
- [x] Draft → Sent → Accepted status flow
- [x] Status badges and filters on dashboard
- [x] "Mark as Sent" button functionality

### Product Catalog Integration
- [x] Catalog CRUD
- [x] Import catalog items into quote line items (Quick-Add)

### Settings
- [x] User profile settings
- [x] Company details for quotes
- [x] Default terms and conditions

---

## Phase 2 - Estimator AI Prompt (NEXT)

### "Ask About This Quote" Feature
- [ ] Controlled prompt interface (not free chat)
- [ ] Pre-defined question types:
  - "What might I have missed?"
  - "What risks should I consider?"
  - "What assumptions should I state?"
  - "Does this look under-priced?"
  - "What usually causes issues on jobs like this?"
- [ ] AI output categorized as:
  - Suggested additions
  - Potential risks
  - Assumptions to consider
  - Questions for the user
- [ ] AI respects locked items as immutable
- [ ] AI only appends, never rewrites
- [ ] All AI output is internal-only (never client-visible)

### OpenAI Integration
- [ ] Configure OpenAI API key
- [ ] Implement LLM invocation for estimator prompts
- [ ] Context injection (quote data, tender context, internal estimates)

---

## Phase 3 - Quote History Intelligence (FUTURE)

- [ ] Upload historical quotes & tenders
- [ ] Index historical data per organisation
- [ ] Pattern extraction (common line items, exclusions, pricing ranges)
- [ ] Reference-based suggestions ("On similar past jobs, you usually include X")

---

## Phase 4 - Wholesale & Scale (FUTURE)

- [ ] White-label / partner mode
- [ ] API / embed into other platforms
- [ ] "Powered by idoyourquotes"

---

## Technical Debt & Improvements
- [x] Unit tests for auth
- [x] Unit tests for quote CRUD
- [ ] Add more comprehensive test coverage
- [ ] Error handling improvements
- [ ] Loading states and optimistic updates

## Current Sprint - Quote Status Workflow
- [x] Backend: Add updateQuoteStatus procedure
- [x] Dashboard: Add status filter tabs (All, Draft, Sent, Accepted)
- [x] Dashboard: Add colored status badges
- [x] QuoteWorkspace: Implement "Mark as Sent" button with confirmation
- [x] QuoteWorkspace: Add "Mark as Accepted" button for sent quotes
- [x] QuoteWorkspace: Show status-appropriate action buttons
- [x] Unit tests for status transitions

## Current Sprint - Catalog Quick-Add
- [x] Add "Add from Catalog" button to line items section
- [x] Create catalog picker dropdown
- [x] Import catalog item as new line item with pre-filled values
- [x] Unit tests for catalog quick-add

## Phase 2 - Estimator AI
- [x] Backend: Create askAboutQuote procedure with LLM integration
- [x] Build context from quote data (client, line items, totals, terms)
- [x] Pre-defined prompts: "What might I have missed?", "What risks should I consider?", "What assumptions should I state?", "Does this look under-priced?", "What usually causes issues on jobs like this?"
- [x] AI Assistant tab UI with question buttons
- [x] Display AI responses with markdown rendering
- [x] Unit tests for AI prompt feature
