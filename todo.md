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

## Phase 3 - AI Input Analysis & Quote Generation (CRITICAL - CORE VALUE)

### Audio Transcription
- [x] Integrate Whisper API for audio transcription
- [x] Add "Transcribe" button on audio input items
- [x] Store transcription text linked to input record
- [x] Display processing status on input items

### PDF Text Extraction
- [x] Extract text from uploaded PDF documents using LLM vision
- [x] Store extracted text linked to input record
- [x] Display processing status on input items

### Image OCR & Vision Analysis
- [x] Integrate vision AI for image/drawing analysis
- [x] Extract text from images (OCR)
- [x] Analyze drawings for specifications, measurements
- [x] Store analysis linked to input record
- [x] Display processing status on input items

### Prompt Input Area
- [x] Add prompt/email paste area in Inputs tab
- [x] Store prompt text as user prompt state
- [x] Include prompt in Generate Draft context

### Generate Draft Feature (Primary Action)
- [x] "Generate Draft" button as top-right primary action
- [x] Combine all processed evidence (transcriptions, extractions, analyses, prompts)
- [x] Send to LLM with structured quote generation prompt
- [x] Auto-populate client details (name, email, phone, address)
- [x] Auto-populate quote title and description
- [x] Auto-populate suggested line items with quantities and rates
- [x] Auto-populate assumptions and exclusions in tender context
- [x] Auto-populate risk notes in internal estimate
- [x] Allow user review and edit before saving

### UI Updates
- [x] Rename "AI Review" tab to "Ask AI"
- [x] Display processing status on input items
- [x] Process buttons on each input item
- [x] Move "Generate Draft" to header as primary action button

### Unit Tests
- [x] Tests for audio transcription
- [x] Tests for image analysis
- [x] Tests for Generate Draft procedure

## Generate Email Feature (Scope Change) - COMPLETE

### Requirements
- [x] Remove "Send Quote" email sending (keep "Mark as Sent" as status toggle only)
- [x] Add "Generate Email" button on Quote tab (near PDF/Save)
- [x] Modal with editable subject line and HTML body preview
- [x] "Copy Subject" and "Copy Email" buttons (HTML clipboard)
- [x] Backend generateEmail procedure with LLM

### AI Content Rules
- [x] Use quote context: client name, title, description, line items, totals
- [x] Use assumptions/exclusions if client-facing
- [x] Never invent scope or details not in quote
- [x] Use [placeholders] for missing values
- [x] No internal notes, risk notes, AI language, confidence scores

### Email Style
- [x] Professional, confident, plain English
- [x] No emojis, no hype, no long preambles
- [x] Minimal formatting: headings only (1-3 max), short bullets
- [x] Structure: Subject → Greeting → Intro → Summary → Key Notes → Close

### Unit Tests
- [x] Test generateEmail procedure (20 tests in email.test.ts)

## Bug Fixes

### Generate Draft fails when user prompt is provided but audio not processed - FIXED
- [x] Fix: User prompt should count as valid evidence even if audio files are not processed
- [x] The error "No processed evidence found" should not appear when userPrompt is provided

### File deletion doesn't remove files from Cloudflare R2 - FIXED
- [x] When user deletes an input from dashboard, also delete the file from R2 storage
- [x] Extract file key from input record and call deleteFromR2
- [x] Add unit tests for file cleanup (7 new tests)

### R2 deletion not working - investigation in progress
- [ ] Investigate why files remain in R2 after dashboard deletion
- [ ] Check if deleteFromR2 is being called with correct file key
- [ ] Verify R2 API token has delete permissions

### Improve R2 folder structure for multi-tenancy - COMPLETE
- [x] Change folder path from quotes/{quoteId}/ to users/{userId}/quotes/{quoteId}/
- [x] Better defense-in-depth for multi-tenant file isolation

### Use quote reference in R2 folder path for traceability - COMPLETE
- [x] Change folder path from users/{userId}/quotes/{quoteId}/ to users/{userId}/quotes/{quoteReference}/
- [x] Makes it easier to trace files back to specific quotes in Cloudflare

## Organization Layer Implementation

### Database Schema - COMPLETE
- [x] Create organizations table (id, name, slug, billing_email, created_at, updated_at)
- [x] Create org_members table (org_id, user_id, role, invited_at, accepted_at)
- [x] Create usage_logs table (org_id, user_id, action_type, credits_used, created_at)
- [x] Add org_id to quotes table (org owns quotes)
- [x] Add created_by_user_id to quotes table (track who created)
- [x] Migrate existing data - create org for each existing user

### Backend Changes - COMPLETE
- [x] Add org helpers to db.ts (getUserPrimaryOrg, logUsage)
- [x] Update file upload to use org-scoped folder path
- [x] Update quotes.list to filter by org_id (with fallback to user_id)
- [x] Update quotes.get to use org-based access (with fallback)
- [x] Update quotes.create to set orgId from user's org
- [x] Update catalog.list to filter by org_id (with fallback to user_id)
- [x] Update catalog.create to set orgId from user's org
- [x] Auto-create org when user signs up (in createUser helper)
- [x] Add usage logging to AI operations (generateDraft, transcribe, extractPdf, analyzeImage, askAi, generateEmail)

### Frontend Changes
- [ ] Add org context provider
- [ ] Update dashboard to show org name
- [ ] Add team/member management UI (placeholder for now)

### R2 Storage - COMPLETE
- [x] Update folder structure to use org slug instead of user id
- [x] Path: orgs/{org_slug}/quotes/{quote_reference}/

### Unit Tests
- [ ] Test org creation on signup
- [ ] Test org-based quote access
- [ ] Test member roles and permissions

## Bug Fixes - Critical

### Login failing due to column name mismatch - FIXED
- [x] Fix users table: passwordHash -> password_hash, isActive -> is_active, etc.
- [x] Fix quotes table: clientName -> client_name, taxRate -> tax_rate, etc.
- [x] Fix quoteLineItems table: quoteId -> quote_id, sortOrder -> sort_order, etc.
- [x] Fix quoteInputs table: inputType -> input_type, fileUrl -> file_url, etc.
- [x] Fix catalogItems table: defaultRate -> default_rate, costPrice -> cost_price, etc.
- [x] Test and deploy

### Quote viewing/editing broken - org migration incomplete - FIXED
- [x] Created getQuoteWithOrgAccess() helper function for org-first pattern
- [x] Updated quotes.getFull to use org-first pattern with fallback
- [x] Updated quotes.update to use org-first pattern with fallback
- [x] Updated quotes.delete to use org-first pattern with fallback
- [x] Updated quotes.updateStatus to use org-first pattern with fallback
- [x] Updated generatePDF and generateEmail to use org-first pattern
- [x] Updated all lineItems procedures (list, create, update, delete)
- [x] Updated all inputs procedures (list, create, delete, uploadFile, getFileUrl, transcribe, extractPdf, analyzeImage)
- [x] Updated tenderContext and internalEstimate procedures
- [x] Updated AI procedures (askAboutQuote, generateDraft)
- [x] All 102 tests passing
- [ ] SQL backfill to set org_id on existing quotes (user must run on Render PostgreSQL)


### Quote viewing/creation broken - needs three fixes - FIXED
- [x] Add detailed error logging to quotes.getFull in server/routers.ts
- [x] Fix quote creation flow - auto-navigate already exists in Dashboard.tsx
- [x] Add error UI to QuoteWorkspace with loading state, error state, retry button
- [x] All 102 tests passing


### File upload failing - column name mismatch in quote_inputs - FIXED
- [x] Fixed quote_inputs table columns (processedContent, processingStatus, processingError renamed to snake_case)
- [x] Fixed Extract/Analyze/Transcribe button visibility (now shows for pending status)
- [x] Test and deploy


### Auto-analyze uploaded files - COMPLETE
- [x] Update uploadFile procedure to auto-trigger analysis after successful upload
- [x] Remove manual Extract/Analyze/Transcribe buttons from QuoteWorkspace UI
- [x] Show processing status indicator while analysis is running ("Analyzing..." with spinner)
- [x] Keep Retry button for failed processing
- [ ] Test and deploy
