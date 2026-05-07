# IdoYourQuotes - Complete Product Blueprint

**Version:** 3.3  
**Last Updated:** May 7, 2026  
**Status:** MVP Complete, Multi-Tenancy Complete, Production Live, Pre-launch Hardening — P0 Security & Cost Shipped, P1 Customer-facing Bugs Shipped, P2 Hygiene Pending

---

## Executive Summary

IdoYourQuotes is an AI-powered quoting application designed for trades, contractors, and service businesses. The platform transforms raw inputs (phone recordings, PDFs, Word documents, Excel spreadsheets, images, emails) into professional, client-ready quotes using AI assistance while keeping the user in full control.

**Core Value Proposition:** "We do your quotes" - Turn tenders, calls, and chaos into professional quotes. Nothing gets sent without your approval.

**Live URL:** https://idoyourquotes.com

---

## Table of Contents

1. [Product Vision](#product-vision)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Database Schema](#database-schema)
5. [Feature Inventory](#feature-inventory)
6. [API Reference](#api-reference)
7. [File Storage Architecture](#file-storage-architecture)
8. [AI Integration](#ai-integration)
9. [Security & Multi-Tenancy](#security--multi-tenancy)
10. [Frontend Architecture](#frontend-architecture)
11. [Backend Architecture](#backend-architecture)
12. [Deployment & Infrastructure](#deployment--infrastructure)
13. [Test Coverage](#test-coverage)
14. [Future Roadmap](#future-roadmap)

---

## Product Vision

### Target Users

| Segment | Description | Key Pain Points |
|---------|-------------|-----------------|
| **Solo Tradespeople** | Electricians, plumbers, painters | Quoting takes hours, loses jobs to faster competitors |
| **Small Contractors** | 2-10 person teams | Inconsistent quote quality, no time for admin |
| **Service Businesses** | Cleaning, landscaping, maintenance | High volume of small quotes, repetitive work |

### Core Differentiators

1. **AI-Assisted, Human-Controlled** - AI drafts, you approve. Nothing automatic.
2. **Multi-Input Processing** - Phone recordings, PDFs, Word docs, Excel, images, emails all become quote data.
3. **4-Tab Pipeline** - Clear separation between raw inputs, interpretation, internal notes, and client-facing output.
4. **Professional Output** - Clean PDFs with your branding, no AI language visible to clients.
5. **Brand Color Extraction** - Automatically extracts colors from your logo for branded PDFs.

---

## Technology Stack

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 19 | UI components and state management |
| Styling | Tailwind CSS 4 | Utility-first styling |
| UI Components | shadcn/ui | Consistent, accessible component library |
| Routing | Wouter | Lightweight client-side routing |
| Data Fetching | tRPC + TanStack Query | Type-safe API calls with caching |
| Markdown | Streamdown | AI response rendering with streaming |

### Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 22 | Server runtime |
| Framework | Express 4 | HTTP server |
| API Layer | tRPC 11 | Type-safe RPC with Superjson |
| ORM | Drizzle ORM | Type-safe database queries |
| Authentication | JWT + bcrypt | Session management |
| Document Parsing | mammoth.js, xlsx | Word and Excel parsing |

### Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | PostgreSQL 16 (Render) | Managed cloud database |
| File Storage | Cloudflare R2 | S3-compatible object storage |
| Hosting | Render | Application hosting with auto-deploy |
| CDN | Cloudflare | Edge caching and DDoS protection |
| Version Control | GitHub | Source code management |

### AI Services

| Service | Provider | Purpose |
|---------|----------|---------|
| LLM | OpenAI GPT-4o | Quote generation, analysis, email drafting |
| Vision | Claude (Anthropic) | PDF/image visual analysis and text extraction |
| Transcription | OpenAI Whisper | Audio-to-text for phone recordings |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   React 19  │  │   tRPC      │  │   TanStack Query        │  │
│  │   + Wouter  │  │   Client    │  │   (Caching/Mutations)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                         RENDER (Node.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Express   │  │   tRPC      │  │   Auth Middleware       │  │
│  │   Server    │  │   Router    │  │   (JWT Sessions)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Business Logic Layer                     ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ ││
│  │  │ Quotes   │ │ Catalog  │ │ Inputs   │ │ AI Processing  │ ││
│  │  │ Router   │ │ Router   │ │ Router   │ │ (LLM/Claude)   │ ││
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ ││
│  │  │ Tender   │ │ Internal │ │ PDF Gen  │ │ Email Gen      │ ││
│  │  │ Context  │ │ Estimate │ │          │ │                │ ││
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
          │                                        │
          ▼                                        ▼
┌──────────────────┐                    ┌──────────────────┐
│   PostgreSQL 16  │                    │  Cloudflare R2   │
│   (Render)       │                    │  (File Storage)  │
│                  │                    │                  │
│  - organizations │                    │  orgs/           │
│  - org_members   │                    │    {slug}/       │
│  - users         │                    │      quotes/     │
│  - quotes        │                    │        {ref}/    │
│  - line_items    │                    │          files   │
│  - inputs        │                    │                  │
│  - tender_ctx    │                    │  logos/          │
│  - internal_est  │                    │    {user_id}/    │
│  - catalog       │                    │                  │
│  - usage_logs    │                    │                  │
└──────────────────┘                    └──────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│  organizations  │       │     users       │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ name            │       │ email (unique)  │
│ slug (unique)   │       │ password_hash   │
│ company_name    │       │ name            │
│ company_address │       │ role            │
│ company_phone   │       │ is_active       │
│ company_email   │       │ company_name    │
│ company_logo    │       │ company_logo    │
│ brand_primary   │       │ default_terms   │
│ brand_secondary │       │ created_at      │
│ default_terms   │       │ updated_at      │
│ billing_email   │       │ last_signed_in  │
│ stripe_cust_id  │       └────────┬────────┘
│ ai_credits      │                │
│ created_at      │                │
│ updated_at      │                │
└────────┬────────┘                │
         │                         │
         │    ┌────────────────────┘
         │    │
         ▼    ▼
┌─────────────────┐
│   org_members   │
├─────────────────┤
│ id (PK)         │
│ org_id (FK)     │───────────────────┐
│ user_id (FK)    │                   │
│ role            │                   │
│ invited_at      │                   │
│ accepted_at     │                   │
│ created_at      │                   │
└─────────────────┘                   │
                                      │
┌─────────────────┐                   │
│     quotes      │◄──────────────────┘
├─────────────────┤
│ id (PK)         │
│ org_id (FK)     │
│ user_id (FK)    │
│ created_by_id   │
│ reference       │───────────────────┐
│ status          │                   │
│ client_name     │                   │
│ client_email    │                   │
│ client_phone    │                   │
│ client_address  │                   │
│ title           │                   │
│ description     │                   │
│ terms           │                   │
│ valid_until     │                   │
│ subtotal        │                   │
│ tax_rate        │                   │
│ tax_amount      │                   │
│ total           │                   │
│ created_at      │                   │
│ updated_at      │                   │
│ sent_at         │                   │
│ accepted_at     │                   │
└────────┬────────┘                   │
         │                            │
    ┌────┴────┬───────────┬───────────┤
    │         │           │           │
    ▼         ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐
│ line    │ │ inputs  │ │ tender  │ │ internal    │
│ items   │ │         │ │ context │ │ estimates   │
├─────────┤ ├─────────┤ ├─────────┤ ├─────────────┤
│ id      │ │ id      │ │ id      │ │ id          │
│ quote_id│ │ quote_id│ │ quote_id│ │ quote_id    │
│ sort_ord│ │ input_  │ │ symbol_ │ │ notes       │
│ descrip │ │   type  │ │ mappings│ │ cost_break  │
│ quantity│ │ filename│ │ assumpt │ │ time_est    │
│ unit    │ │ file_url│ │ exclus  │ │ risk_notes  │
│ rate    │ │ file_key│ │ notes   │ │ ai_suggest  │
│ total   │ │ content │ │ created │ │ created_at  │
│ created │ │ mime_   │ │ updated │ │ updated_at  │
│ updated │ │   type  │ └─────────┘ └─────────────┘
└─────────┘ │ process │
            │   _cont │
            │ process │
            │   _stat │
            │ process │
            │   _err  │
            │ created │
            └─────────┘

┌─────────────────┐       ┌─────────────────┐
│  catalog_items  │       │   usage_logs    │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ org_id (FK)     │       │ org_id (FK)     │
│ user_id (FK)    │       │ user_id (FK)    │
│ name            │       │ action_type     │
│ description     │       │ credits_used    │
│ category        │       │ metadata (JSON) │
│ unit            │       │ created_at      │
│ default_rate    │       └─────────────────┘
│ cost_price      │
│ is_active       │
│ created_at      │
│ updated_at      │
└─────────────────┘
```

### Table Definitions

#### organizations
Multi-tenant container for all business data. Auto-created when a user registers.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Organization display name |
| slug | VARCHAR(100) | NOT NULL, UNIQUE | URL-safe identifier for file paths |
| company_name | VARCHAR(255) | | Legal company name |
| company_address | TEXT | | Business address |
| company_phone | VARCHAR(50) | | Contact phone |
| company_email | VARCHAR(320) | | Contact email |
| company_logo | TEXT | | Logo URL in R2 |
| brand_primary_color | VARCHAR(7) | | Hex color extracted from logo |
| brand_secondary_color | VARCHAR(7) | | Hex color extracted from logo |
| default_terms | TEXT | | Default quote terms |
| billing_email | VARCHAR(320) | | Billing contact |
| stripe_customer_id | VARCHAR(255) | | Stripe integration (future) |
| ai_credits_remaining | INT | DEFAULT 0 | Usage-based billing (future) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### org_members
Links users to organizations with role-based access.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| org_id | BIGINT | NOT NULL, FK | Organization reference |
| user_id | BIGINT | NOT NULL, FK | User reference |
| role | ENUM | NOT NULL, DEFAULT 'member' | owner, admin, member |
| invited_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | When invitation sent |
| accepted_at | TIMESTAMP | | When user accepted |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### users
Individual user accounts with standalone email/password authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| email | VARCHAR(320) | NOT NULL, UNIQUE | Login email |
| password_hash | TEXT | NOT NULL | bcrypt hashed password |
| name | TEXT | | Display name |
| role | ENUM | NOT NULL, DEFAULT 'user' | user, admin |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Account status |
| company_name | VARCHAR(255) | | User's company name |
| company_address | TEXT | | Business address |
| company_phone | VARCHAR(50) | | Contact phone |
| company_email | VARCHAR(320) | | Contact email |
| default_terms | TEXT | | Default T&C for quotes |
| company_logo | TEXT | | Logo URL |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| last_signed_in | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### quotes
Main quote entity with full client and pricing details.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| org_id | BIGINT | FK | Organization owner |
| user_id | BIGINT | NOT NULL, FK | User owner |
| created_by_user_id | BIGINT | FK | User who created |
| reference | VARCHAR(100) | | Display reference (Q-timestamp) |
| status | ENUM | NOT NULL, DEFAULT 'draft' | draft, sent, accepted, declined |
| client_name | VARCHAR(255) | | Client's name |
| client_email | VARCHAR(320) | | Client's email |
| client_phone | VARCHAR(50) | | Client's phone |
| client_address | TEXT | | Client's address |
| title | VARCHAR(255) | | Quote title/project name |
| description | TEXT | | Project description |
| terms | TEXT | | Terms and conditions |
| valid_until | TIMESTAMP | | Quote expiry date |
| subtotal | DECIMAL(12,2) | DEFAULT 0.00 | Sum of line items |
| tax_rate | DECIMAL(5,2) | DEFAULT 0.00 | Tax percentage |
| tax_amount | DECIMAL(12,2) | DEFAULT 0.00 | Calculated tax |
| total | DECIMAL(12,2) | DEFAULT 0.00 | Final total |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| sent_at | TIMESTAMP | | When marked as sent |
| accepted_at | TIMESTAMP | | When accepted |

#### quote_line_items
Individual priced items on a quote.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| quote_id | BIGINT | NOT NULL, FK | Parent quote |
| sort_order | INT | DEFAULT 0 | Display order |
| description | TEXT | NOT NULL | Item description |
| quantity | DECIMAL(12,4) | DEFAULT 1.0000 | Quantity |
| unit | VARCHAR(50) | DEFAULT 'each' | Unit of measure |
| rate | DECIMAL(12,2) | DEFAULT 0.00 | Price per unit |
| total | DECIMAL(12,2) | DEFAULT 0.00 | Line total |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### quote_inputs
Raw evidence files and text attached to quotes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| quote_id | BIGINT | NOT NULL, FK | Parent quote |
| input_type | ENUM | NOT NULL | pdf, image, audio, email, text, document |
| filename | VARCHAR(255) | | Original filename |
| file_url | TEXT | | Presigned URL (temporary) |
| file_key | VARCHAR(255) | | R2 storage key |
| content | TEXT | | Text content (for text/email type) |
| mime_type | VARCHAR(100) | | File MIME type |
| processed_content | TEXT | | AI-extracted content |
| processing_status | VARCHAR(20) | DEFAULT 'pending' | pending, processing, completed, failed |
| processing_error | TEXT | | Error message if failed |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### tender_contexts
Interpretation layer - symbol mappings and assumptions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| quote_id | BIGINT | NOT NULL, UNIQUE, FK | Parent quote |
| symbol_mappings | JSON | | `{symbol: {meaning, confirmed, confidence}}` |
| assumptions | JSON | | `[{text, confirmed}]` |
| exclusions | JSON | | `[{text, confirmed}]` |
| notes | TEXT | | Additional interpretation notes |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### internal_estimates
Private notes and cost analysis (never client-visible).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| quote_id | BIGINT | NOT NULL, UNIQUE, FK | Parent quote |
| notes | TEXT | | Private notes |
| cost_breakdown | JSON | | `[{item, cost, notes}]` |
| time_estimates | JSON | | `[{task, hours, rate}]` |
| risk_notes | TEXT | | Risk assessment |
| ai_suggestions | JSON | | `[{type, text, applied}]` |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### catalog_items
Reusable products/services for quick-add to quotes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| org_id | BIGINT | FK | Organization owner |
| user_id | BIGINT | NOT NULL, FK | User owner |
| name | VARCHAR(255) | NOT NULL | Item name |
| description | TEXT | | Item description |
| category | VARCHAR(100) | | Category for filtering |
| unit | VARCHAR(50) | DEFAULT 'each' | Unit of measure |
| default_rate | DECIMAL(12,2) | DEFAULT 0.00 | Default price |
| cost_price | DECIMAL(12,2) | | Internal cost (for margin calc) |
| is_active | INT | DEFAULT 1 | Active/archived |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

#### usage_logs
AI usage tracking for billing and analytics.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PK | Unique identifier |
| org_id | BIGINT | NOT NULL, FK | Organization |
| user_id | BIGINT | NOT NULL, FK | User who triggered |
| action_type | VARCHAR(50) | NOT NULL | generate_draft, transcribe_audio, extract_pdf, analyze_image, ask_ai, generate_email, parse_document |
| credits_used | INT | NOT NULL, DEFAULT 1 | Credits consumed |
| metadata | JSON | | Additional context (quoteId, inputId, etc.) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

---

## Feature Inventory

### Phase 1 - MVP Quote Engine ✅ COMPLETE

| Feature | Status | Description |
|---------|--------|-------------|
| User Authentication | ✅ | Email/password with JWT sessions |
| Company Registration | ✅ | Company name captured at signup, org auto-created |
| Quote CRUD | ✅ | Create, read, update, delete quotes |
| Quote Deletion with Cleanup | ✅ | Deletes quote, line items, inputs, and R2 files |
| Line Items | ✅ | Add, edit, reorder, delete line items |
| Inline Editing | ✅ | Edit description, quantity, unit, rate inline |
| Auto-Calculations | ✅ | Subtotal, tax, total auto-calculated |
| Status Workflow | ✅ | Draft → Sent → Accepted/Declined |
| PDF Generation | ✅ | Professional PDF with company branding and colors |
| Brand Color Extraction | ✅ | Auto-extracts colors from uploaded logo |
| Product Catalog | ✅ | Reusable items with quick-add to quotes |
| Settings | ✅ | User profile, company details, default terms |
| File Upload | ✅ | PDF, Word, Excel, images, audio to Cloudflare R2 |
| Landing Page | ✅ | Professional homepage with demo video |

### Phase 2 - AI Integration ✅ COMPLETE

| Feature | Status | Description |
|---------|--------|-------------|
| Ask AI | ✅ | Pre-defined prompts for quote review |
| Audio Transcription | ✅ | Whisper API for phone recordings |
| PDF Visual Analysis | ✅ | Claude Vision for document analysis |
| Image Analysis | ✅ | Claude Vision for drawings/photos |
| Word Document Parsing | ✅ | mammoth.js for .doc/.docx files |
| Excel/CSV Parsing | ✅ | xlsx library for spreadsheets |
| Auto-Analyze on Upload | ✅ | Files automatically processed after upload |
| Real-time Status Updates | ✅ | Polling updates processing status every 3 seconds |
| Generate Draft | ✅ | AI populates quote from all inputs |
| Generate Email | ✅ | AI drafts professional email with copy buttons |
| URL Scraping | ✅ | Auto-scrapes URLs in instructions for context |

### Phase 3 - Multi-Tenancy ✅ COMPLETE

| Feature | Status | Description |
|---------|--------|-------------|
| Organizations Table | ✅ | Multi-tenant container |
| Org Members | ✅ | Role-based access (owner/admin/member) |
| Usage Logging | ✅ | Track AI usage per org |
| Org-Scoped Storage | ✅ | R2 folders by org slug |
| Auto-Create Org | ✅ | Create org on user signup |
| Org-Based Queries | ✅ | Filter quotes/catalog by org_id with fallback |
| Team Management UI | ⏳ | Invite/manage team members (future) |

### Phase 4 - Branded Proposals & Profit Visibility ✅ COMPLETE

| Feature | Status | Description |
|---------|--------|-------------|
| Branded Proposal Pipeline (Tile 3) | ✅ | Brochure-aware proposals: brochure cover verbatim, formal Title Page, AI-generated narrative chapters wrapping embedded brochure pages |
| Multi-Tag Brochure Classification | ✅ | Each brochure page carries a primary tag plus secondary tags; two-pass slot picker matches primary first, falls back to any-tag |
| Branding Settings Consolidation | ✅ | "Your Branded Quotes" tab unifies Logo, Brochure, Design Template, Stat Strip toggle (Logo moved from Profile, Brochure absorbed from retired tab) |
| Brochure Page Scaling | ✅ | Embedded brochure pages scale to fill the proposal page (was no-upscale, leaving 30% letterbox on small-format brochures) |
| Branded PDF Filename | ✅ | Format is `<quote title> <today's date>.pdf` matching the title-page date convention |
| Buy-in Cost Column | ✅ | Editable per-line cost on the Quote Workspace, distinct from null (not entered) and explicit £0 (passthrough) |
| Profit Column | ✅ | Live-derived £ amount and margin % per line; muted dash when no cost entered |
| Quote Summary Profit Pill | ✅ | "of which £X profit" line on the green summary card, broken out by pricing type |
| Dashboard Profit & Margin Columns | ✅ | Per-quote totals from a SQL-aggregating list helper (LEFT JOIN with SUM, single round-trip) |
| Catalog Cost Auto-Fill | ✅ | AI-generated lines that match a catalog item by name auto-populate buy-in cost from the catalog |
| Catalogue Tailoring Nudge | ✅ | Dashboard banner prompts seedable-sector users to tailor their starter catalogue before their first real quote |

### Future Phases

| Phase | Features |
|-------|----------|
| **Quote History Intelligence** | Upload historical quotes, pattern extraction, reference-based suggestions |
| **Pricing Tiers** | Solo £29/mo, Team £59/mo, Pro £119/mo with AI credits |
| **Stripe Integration** | Subscription billing, overage charges |
| **White-Label** | Partner mode, API access, "Powered by IdoYourQuotes" |
| **Duplicate Quote** | Copy existing quote as starting point |
| **Customer Service Bot** | AI-powered in-app support and email triage; data-aware help that knows the user's current quote, brochure, and recent activity |

---

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `auth.me` | Query | Get current user (null if not logged in) |
| `auth.logout` | Mutation | Clear session cookie, redirect to homepage |
| `auth.updateProfile` | Mutation | Update user profile and company details |
| `auth.uploadLogo` | Mutation | Upload logo, extract brand colors |
| `auth.changePassword` | Mutation | Change user password |

### Quotes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `quotes.list` | Query | Get all quotes for user's org |
| `quotes.get` | Query | Get single quote by ID |
| `quotes.getFull` | Query | Get quote with line items, inputs, context |
| `quotes.create` | Mutation | Create new quote (auto-populates T&C) |
| `quotes.update` | Mutation | Update quote fields |
| `quotes.updateStatus` | Mutation | Change quote status with validation |
| `quotes.delete` | Mutation | Delete quote, inputs, and R2 files |
| `quotes.generatePDF` | Mutation | Generate PDF HTML with branding |
| `quotes.generateEmail` | Mutation | Generate professional email draft |

### Line Items

| Endpoint | Method | Description |
|----------|--------|-------------|
| `lineItems.list` | Query | Get line items for quote |
| `lineItems.create` | Mutation | Add line item, recalculate totals |
| `lineItems.update` | Mutation | Update line item, recalculate totals |
| `lineItems.delete` | Mutation | Delete line item, recalculate totals |

### Inputs (Evidence)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `inputs.list` | Query | Get inputs for quote |
| `inputs.create` | Mutation | Create text/email input |
| `inputs.uploadFile` | Mutation | Upload file to R2, auto-analyze |
| `inputs.delete` | Mutation | Delete input and R2 file |
| `inputs.getFileUrl` | Query | Get fresh presigned URL |
| `inputs.storageStatus` | Query | Check if R2 is configured |
| `inputs.transcribeAudio` | Mutation | Transcribe audio with Whisper |
| `inputs.extractPdfText` | Mutation | Analyze PDF with Claude Vision |
| `inputs.analyzeImage` | Mutation | Analyze image with Claude Vision |

### AI Features

| Endpoint | Method | Description |
|----------|--------|-------------|
| `ai.generateDraft` | Mutation | Generate quote from all inputs |
| `ai.askAboutQuote` | Mutation | Get AI suggestions (missed, risks, assumptions, pricing, issues) |

### Catalog

| Endpoint | Method | Description |
|----------|--------|-------------|
| `catalog.list` | Query | Get all catalog items for org |
| `catalog.create` | Mutation | Add catalog item |
| `catalog.update` | Mutation | Update catalog item |
| `catalog.delete` | Mutation | Delete catalog item |

### Tender Context & Internal Estimates

| Endpoint | Method | Description |
|----------|--------|-------------|
| `tenderContext.get` | Query | Get interpretation data |
| `tenderContext.upsert` | Mutation | Save assumptions, exclusions, symbol mappings |
| `internalEstimate.get` | Query | Get internal notes |
| `internalEstimate.upsert` | Mutation | Save cost breakdown, time estimates, risk notes |

---

## File Storage Architecture

### Cloudflare R2 Configuration

| Setting | Value |
|---------|-------|
| Bucket | `idoyourquotes-uploads` |
| Region | Auto (Cloudflare edge) |
| Public Access | Disabled (presigned URLs only) |
| URL Expiry | 7 days |

### Folder Structure

```
idoyourquotes-uploads/
├── orgs/
│   └── {org_slug}/                    # e.g., wez-org
│       └── quotes/
│           └── {quote_reference}/     # e.g., Q-1770124860742
│               ├── Lp-ehTCpyp-document.pdf
│               ├── Ab-x7Yz12-photo.jpg
│               ├── Cd-9Kl3mn-recording.mp3
│               └── Xy-4Mn8pq-spreadsheet.xlsx
└── logos/
    └── {user_id}/
        └── company-logo.png
```

### File Naming Convention

```
{random_id}-{sanitized_original_filename}
```

- `random_id`: 10-character alphanumeric for uniqueness
- `sanitized_filename`: Original name with special characters removed

### Supported File Types

| Type | Extensions | Processing |
|------|------------|------------|
| PDF | .pdf | Claude Vision analysis |
| Word | .doc, .docx | mammoth.js text extraction |
| Excel | .xls, .xlsx, .csv | xlsx library parsing |
| Images | .jpg, .jpeg, .png, .gif, .webp | Claude Vision analysis |
| Audio | .mp3, .wav, .m4a, .ogg, .webm | Whisper transcription |

### Security Model

1. **No Public URLs** - All files accessed via presigned URLs
2. **Org Isolation** - Files stored under org slug folder
3. **Quote Isolation** - Files further isolated by quote reference
4. **Time-Limited Access** - Presigned URLs expire after 7 days
5. **Ownership Verification** - API verifies quote ownership before generating URLs
6. **Deletion Cleanup** - Files deleted from R2 when quote/input is deleted

---

## AI Integration

### LLM Configuration

| Setting | Value |
|---------|-------|
| Provider | OpenAI |
| Model | GPT-4o |
| Temperature | 0.7 (generation), 0.3 (extraction) |
| Response Format | JSON for structured outputs |

### Vision Analysis Configuration

| Setting | Value |
|---------|-------|
| Provider | Anthropic Claude |
| Model | claude-sonnet-4-20250514 |
| Max Tokens | 4096 |
| Use Case | PDF and image visual analysis |

### Generate Draft Prompt Structure

```
System: You are an expert estimator/quoting assistant...

Context:
- All processed evidence (transcriptions, extractions, analyses)
- User's instructions/email
- Scraped website content (if URLs detected)
- Available catalog items

Output Format (JSON):
{
  clientName, clientEmail, clientPhone, clientAddress,
  title,
  description (3-5 sentences, professional, comprehensive),
  lineItems: [{description, quantity, unit, rate}],
  assumptions: [{text}],
  exclusions: [{text}],
  riskNotes: string,
  symbolMappings: {symbol: {meaning, confirmed}}
}
```

### AI Content Rules

1. **Never invent scope** - Only use information from provided inputs
2. **Use placeholders** - `[Client Name]` for missing data
3. **No AI language** - No "I think", "perhaps", confidence scores
4. **Professional tone** - Confident, plain English
5. **Client-safe output** - No internal notes in client-facing content
6. **Comprehensive descriptions** - 3-5 sentences covering scope, deliverables, objectives

### Usage Credits

| Action | Credits |
|--------|---------|
| generate_draft | 5 |
| transcribe_audio | 2 |
| extract_pdf | 2 |
| analyze_image | 2 |
| parse_document | 1 |
| ask_ai | 1 |
| generate_email | 1 |

---

## Security & Multi-Tenancy

### Authentication Flow

```
1. User submits email/password at /register or /login
2. Server validates credentials (bcrypt compare)
3. Server creates JWT with user ID
4. JWT stored in HTTP-only cookie
5. Subsequent requests include cookie
6. Server validates JWT on each request
7. User context injected into tRPC procedures
8. On logout, cookie cleared, redirect to homepage
```

### Authorization Model

| Level | Implementation |
|-------|----------------|
| **User** | JWT session, user ID in context |
| **Organization** | User's primary org fetched via org_members |
| **Quote** | Verify quote.orgId matches user's org (with userId fallback) |
| **Role** | owner > admin > member permissions |

### Data Isolation

| Resource | Isolation Method |
|----------|------------------|
| Quotes | Filtered by orgId (with userId fallback) |
| Catalog | Filtered by orgId (with userId fallback) |
| Files | Stored under org slug folder |
| Inputs | Accessed via quote ownership |

### Org-First Access Pattern

All quote operations use `getQuoteWithOrgAccess()` helper:
1. Get user's primary org via org_members
2. Try to find quote by quoteId + orgId
3. Fall back to quoteId + userId for legacy data
4. Return null if not found

---

## Frontend Architecture

### Page Structure

| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Landing page with demo video |
| Login | `/login` | Email/password login form |
| Register | `/register` | Registration with company name |
| Dashboard | `/dashboard` | Quote list with filters and stats |
| QuoteWorkspace | `/quote/:id` | 4-tab quote editor |
| Catalog | `/catalog` | Product/service catalog management |
| Settings | `/settings` | User profile and company settings |

### QuoteWorkspace Tabs

| Tab | Purpose |
|-----|---------|
| **Inputs** | Upload files, paste instructions, view processing status |
| **Interpretation** | Symbol mappings, assumptions, exclusions |
| **Internal** | Private notes, cost breakdown, risk assessment |
| **Quote** | Client details, line items, totals, terms, PDF/email generation |

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| DashboardLayout | `components/DashboardLayout.tsx` | Sidebar navigation wrapper |
| AIChatBox | `components/AIChatBox.tsx` | AI conversation interface |
| Map | `components/Map.tsx` | Google Maps integration |

### State Management

- **Server State**: tRPC + TanStack Query for all API data
- **Auth State**: `useAuth()` hook from `_core/hooks/useAuth.ts`
- **Local State**: React useState for UI state
- **Polling**: 3-second interval for processing status updates

---

## Backend Architecture

### Server Files

| File | Purpose |
|------|---------|
| `server/routers.ts` | Main tRPC router with all procedures |
| `server/db.ts` | Database helper functions (Drizzle queries) |
| `server/r2Storage.ts` | Cloudflare R2 upload/download/delete |
| `server/storage.ts` | Manus storage proxy (dev environment) |
| `server/pdfGenerator.ts` | HTML generation for PDF quotes |

### Core Services

| File | Purpose |
|------|---------|
| `server/_core/llm.ts` | OpenAI GPT-4o integration |
| `server/_core/claude.ts` | Anthropic Claude Vision integration |
| `server/_core/voiceTranscription.ts` | Whisper audio transcription |
| `server/_core/webScraper.ts` | URL content extraction |

### Document Parsers

| File | Purpose |
|------|---------|
| `server/services/wordParser.ts` | Word document text extraction |
| `server/services/excelParser.ts` | Excel/CSV parsing |
| `server/services/colorExtractor.ts` | Brand color extraction from logos |

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| auth.test.ts | 6 | Registration, login, profile |
| auth.logout.test.ts | 1 | Session logout |
| quotes.test.ts | 14 | Quote CRUD, deletion with cleanup |
| catalog.test.ts | 7 | Catalog item management |
| fileUpload.test.ts | 18 | File upload, deletion, R2 cleanup |
| pdf.test.ts | 8 | PDF generation |
| ai.test.ts | 10 | AI prompts and suggestions |
| aiProcessing.test.ts | 7 | Input processing |
| email.test.ts | 20 | Email generation |
| status.test.ts | 8 | Quote status transitions |
| documentParsing.test.ts | 11 | Word/Excel parsing |
| **Total** | **114** | All passing |

---

## Deployment & Infrastructure

### Render Configuration

| Setting | Value |
|---------|-------|
| Service Type | Web Service |
| Runtime | Node.js |
| Build Command | `pnpm install && pnpm build` |
| Start Command | `pnpm start` |
| Auto-Deploy | On push to `main` branch |

### Environment Variables (Render)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Session signing secret |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | R2 public endpoint |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Vision |

### GitHub Repository

| Setting | Value |
|---------|-------|
| Repository | `H6gvbhYujnhwP/idoyourquotes` |
| Branch | `main` |
| Auto-Deploy | Enabled via Render webhook |

---

## Test Coverage

| Test File | Tests | Description |
|-----------|-------|-------------|
| auth.test.ts | 6 | User registration, login, profile |
| auth.logout.test.ts | 1 | Session logout |
| quotes.test.ts | 14 | Quote CRUD, status workflow, deletion |
| catalog.test.ts | 7 | Catalog item management |
| fileUpload.test.ts | 18 | File upload, deletion, R2 cleanup |
| pdf.test.ts | 8 | PDF generation with branding |
| ai.test.ts | 10 | AI prompts and suggestions |
| aiProcessing.test.ts | 7 | Input processing (audio, image, PDF) |
| email.test.ts | 20 | Email generation |
| status.test.ts | 8 | Quote status transitions |
| documentParsing.test.ts | 11 | Word/Excel document parsing |
| **Total** | **114** | All passing |

---

## Future Roadmap

### Pre-launch Hardening (May 2026 — block marketing launch on these)

Identified during the deep code audit conducted alongside the customer support bot delivery (E.13). These items are launch-relevant — exposure increases significantly once marketing drives sign-ups.

**Status (May 7, 2026):** All three P0 / P1 customer-impacting categories — App Security (E.15), Cost Protection (E.16), and Customer-facing Bugs (E.17) — are now shipped. Remaining work is P2 code hygiene plus the post-launch bot polish list.

#### App Security (P0) — ✅ SHIPPED in E.15 (May 7, 2026)

- [x] **Add rate limiting to all public endpoints.** Login, register, resend-verification, set-password. Currently no throttling — login brute-force is feasible (8-char passwords with no complexity rules), registration spam is unchecked, resend-verification can be hammered to spam an inbox. Recommended: 5 attempts per 15 minutes per IP with a lockout window after threshold. Express-rate-limit or similar. _Shipped: `express-rate-limit` 7.5.1 added; `authRateLimiter` mounted on `/api/auth/*` in `server/_core/index.ts`. 5 attempts / 15 min per IP, successful logins skipped. `trust proxy = 1` set so Render's X-Forwarded-For resolves correctly._
- [x] **Require email verification before AI features unlock.** Today, registering logs the user in immediately and grants full 14-day trial of all AI features regardless of verification. Gate AI feature access on `emailVerified=true` so unverified accounts can sign up and see the banner but cannot burn AI credits. Prevents fraud sign-ups (anyone with anyone's email) from costing real money. _Shipped: gate added to `assertAIAccess` helper in `server/routers.ts`. Grandfather cutoff hardcoded at 2026-05-08 UTC — anyone created before is treated as verified. Friendly error directs user to the resend banner._
- [x] **Tighten password requirements.** Today: minimum 8 characters, no complexity rules. Combined with no rate limiting this is trivially brute-forceable. Bump to minimum 10 characters with at least one number or symbol. Existing weak passwords stay valid; users prompted to update on next login. _Shipped: rules updated in both `register` and `set-password` endpoints in `server/_core/oauth.ts`, plus `Register.tsx` requirement-pill display and `SetPassword.tsx` two-row hint UI._
- [x] **Per-user AI rate limit.** Even authenticated users can hit AI endpoints as fast as their network allows. Add a soft cap (e.g. 10 AI calls per minute per user) returning a 429 with a friendly retry-after. _Shipped: in-memory sliding window in `server/_core/rateLimit.ts` exposing `assertAIRateLimit(userId)`; called from `assertAIAccess` so every AI-gated endpoint inherits it. 10 requests / 60 seconds per user. Documented as needing Redis migration if Render scales to multi-instance._

#### Cost Protection (P0) — ✅ SHIPPED in E.16 (May 7, 2026)

- [x] **Cap PDF page count on quote uploads.** Currently no upper limit — a 200-page PDF triggers ~20 sequential AI calls (~£0.60 per upload), a 1,000-page PDF would trigger ~100 calls (~£3). The brochure feature has a 30-page cap; quote evidence has none. Apply the same 30-page cap with a clear "split this document" error. _Shipped: `MAX_TOTAL_PAGES = 30` constant in `server/_core/claude.ts`, enforced upfront in both `analyzePdfWithClaude` and `analyzePdfWithOpenAI` before any API spend._
- [x] **Cap file size on quote uploads.** Currently relies only on Express's 50MB JSON body cap. Add explicit per-handler check (e.g. 25MB) that returns a friendly error instead of a generic Express failure. _Shipped: `MAX_UPLOAD_BYTES = 25MB` in `server/r2Storage.ts`, applied at the `uploadToR2` choke point. Inherited by every upload path (quote inputs, brochure, logo)._
- [x] **Cap upload count per quote.** No per-quote limit on number of inputs. A single quote could accumulate hundreds of files, each triggering automatic AI processing on upload. Recommended: 20 inputs per quote with a "this quote has too many files" message. _Shipped: `MAX_INPUTS_PER_QUOTE = 20` in `server/db.ts`, enforced inside `createInput` so every input-creation path inherits it._
- [x] **Honour the support bot's reply length cap.** The bot's `max_tokens: 600` parameter is silently ignored because the underlying `invokeLLM` helper hardcodes `max_tokens` to 16384. One-line fix in `server/_core/llm.ts` to destructure and respect the parameter (other callers don't currently pass it, so they're unaffected). _Shipped: `invokeLLM` now destructures `maxTokens` / `max_tokens` and uses caller-supplied value with the existing conservative ceilings as fallback._

#### Customer-facing bugs (P1) — ✅ SHIPPED in E.17 (May 7, 2026)

- [x] **Stop orphaning team members when the Team owner deletes their account.** Today: deletion removes all team-member rows from the org but only deactivates the owner's user record. Other team members can still log in but the app finds no organisation for them and they hit cryptic "No organisation found" errors. Fix: deactivate all team members too AND send each one an email explaining the org was closed. _Shipped: `deleteAccount` in `server/services/subscriptionRouter.ts` now captures every member's user ID before wiping the roster, deactivates the whole roster (owner + members) in a single `inArray` update, and queues a new "Your IdoYourQuotes team access has ended" email to each non-owner via the new `sendOrgClosedEmail` helper in `server/services/emailService.ts`. Owner still gets the existing goodbye email — unchanged._
- [x] **Fix invite flow for users who already have a personal org.** When an existing user (who signed up themselves at some point) is invited to a Team, the new membership is recorded but `getUserPrimaryOrg` returns the older personal org. They log in, see their old org's data, and never see the team's. The invite silently fails from their perspective. Fix: prompt invited users on next login to pick which org to view, or auto-switch them to the most recently-joined org. _Shipped: `getUserPrimaryOrg` in `server/db.ts` now orders membership rows by `createdAt DESC` so the most recently joined membership wins. Auto-switch behaviour is the surgical P1 fix; a full org-switcher UI remains on the Q1 Team Features roadmap._
- [x] **Disable admin destructive buttons during request.** AdminPanel mutation buttons (Delete User, Reset Password, Extend Trial, Set Tier, etc.) read `isLoading` from tRPC mutations — that field doesn't exist on tRPC v10+, only `isPending` does. So these buttons never visually disable mid-request and double-clicks fire the action twice. Particularly concerning for Delete User. Sweep all admin mutation buttons and rename `isLoading → isPending`. _Shipped: 8 mutation references swept to `.isPending` across 6 mutations in `client/src/pages/AdminPanel.tsx` — Delete User (×2), Reset Password, Extend Trial, Set Quota, Set Tier, Delete Org (×2). Query `isLoading` references left intact (those remain correct on `useQuery`)._
- [x] **Fix the missing phone field on PDF generator.** `server/pdfGenerator.ts:1544` references `user.phone` which doesn't exist on the User type — the actual field is `user.companyPhone`. Quote PDFs may be silently missing the customer's phone in one location. Pre-existing baseline TS error; worth investigating on a recent quote PDF before launch. _Shipped: line 1544 corrected to `organization?.companyPhone || user.companyPhone`. `pdfGenerator.ts` lock broken with explicit owner permission for this single-line surgical fix only. Function `generateElectricalQuoteHTML` at line 1532 is only reachable when `quote.tradePreset === "electrical"`; with the electrical sector permanently deleted this code path is dead for new quotes but still serves any historical electrical-preset quote that gets re-rendered. Two TS errors removed from the baseline (73 → 71)._

**Adjacent issue noted, not actioned in E.17:** `server/pdfGenerator.ts` lines 1542 and 1543 carry the same wrong-field-name bug pattern — `organization?.address` and `organization?.email` should be `organization?.companyAddress` and `organization?.companyEmail`. Two further pre-existing TS errors. Not fixed under E.17 because the blueprint named only the phone field and the lock was unlocked for that named scope only. Worth grouping into the broader electrical-removal cleanup pass.

#### Code Hygiene (P2)

- [ ] **Remove the duplicate `server/index.ts`.** Two near-identical entry-point files exist: `server/index.ts` and `server/_core/index.ts`. Only the second one runs (per `package.json` scripts). The first is dead code that someone could waste time editing. Delete it.
- [ ] **Heal the dual-schema drift between `shared/schema.ts` and `drizzle/schema.ts`.** Per the dual-schema rule, both files should be identical. They have drifted in places — `drizzle/schema.ts` is missing several columns and enums that exist in `shared/schema.ts`. Doesn't break anything today (the runtime DB matches `shared/schema.ts`) but a Drizzle-kit operation could behave unexpectedly. One-time clean-up.
- [ ] **Backfill 168 historical NULL `tradePreset` rows.** Pre-existing data hygiene from earlier deliveries.
- [ ] **Drop the dormant `proposal_orientation` column.** Pre-existing — the column was retired in E.4 (revised) but never dropped from the database.
- [ ] **Fix the EmailScheduler SQL syntax error.** Pre-existing — flagged in earlier session handovers.

#### Bot polish (after security & cost ship)

These came out of the post-launch bot review. Lower priority because the bot is functional.

- [ ] **Add a "Retry" button to the support drawer's startup error banner.** If the initial `startThread` call fails, the chat input stays disabled forever — user has no in-app recovery path beyond closing the drawer and reopening.
- [ ] **Pop the optimistic user echo when a `sendMessage` call errors.** When a user hits the daily message cap, they see their question on screen with no reply and just an error toast — looks like the bot ghosted them rather than that they hit a limit.
- [ ] **Remove dead `refetch` in admin Conversations list.** Cosmetic — destructured but never called.
- [ ] **Update stale comment in `smtpMailer.ts` docblock.** Mentions the old `support@idoyourquotes.com` address before the alias swap.

### Q1 2026 - Team Features

- [ ] Team invitation flow (email invite, accept/decline)
- [ ] Role-based permissions UI
- [ ] Organization settings page
- [ ] Duplicate quote functionality

### Q2 2026 - Pricing & Billing

- [ ] Stripe integration
- [ ] Subscription plans (Solo/Team/Pro)
- [ ] Usage tracking dashboard
- [ ] AI credit packs for overage
- [ ] Invoice generation

### Q2/Q3 2026 - Customer Operations

- [ ] AI-powered in-app help drawer with context awareness (knows current quote, brochure, page)
- [ ] Email support inbox with AI triage and draft replies
- [ ] Self-serve diagnosis ("your render of Q-187 looks wrong because…")
- [ ] Onboarding tutor mode (walks new users through catalog tailoring before first quote)
- [ ] Proactive contextual hints on risky actions (Re-generate, Delete brochure)
- [ ] Human escalation path with conversation transcript
- [ ] Cost / volume controls on the support LLM

### Q3 2026 - Quote Intelligence

- [ ] Historical quote upload
- [ ] Pattern extraction from past quotes
- [ ] "Similar jobs" suggestions
- [ ] Pricing benchmarks
- [ ] Win/loss tracking

### Q4 2026 - Scale & Partners

- [ ] White-label configuration
- [ ] API access for integrations
- [ ] Webhook notifications
- [ ] Multi-currency support
- [ ] Localization (languages)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 4, 2026 | Initial comprehensive blueprint |
| 2.0 | Feb 5, 2026 | Updated with: PostgreSQL migration, Claude Vision integration, Word/Excel parsing, brand color extraction, quote deletion with file cleanup, real-time status polling, sign out redirect fix, YouTube video embed, 114 tests |
| 3.0 | May 7, 2026 | Phase 4 documented complete: Branded Proposal pipeline (Tile 3), multi-tag brochure classification, branding tab consolidation, brochure scale-to-fit, branded PDF filename convention, Buy-in Cost / Profit columns on workspace and dashboard, catalog cost auto-fill, catalogue tailoring nudge. Customer Service Bot added to Future Phases / Future Roadmap as the next major theme alongside Q2 Pricing & Billing. |
| 3.1 | May 7, 2026 | Customer support bot shipped (E.13) with conversation memory across navigation (E.14). Pre-launch hardening section added to Future Roadmap covering 4 priority categories: App Security (rate limiting, email-verification gating, password complexity, AI rate limit), Cost Protection (PDF page caps, file size caps, upload count caps, bot reply length cap), Customer-facing bugs (team-member orphaning on owner deletion, broken invite flow for users with existing orgs, admin button isPending fix, PDF phone-field reference), and Code Hygiene. Identified during deep code audit. Items marked P0 are launch-blockers. |
| 3.2 | May 7, 2026 | Pre-launch Hardening P0 work shipped: E.15 App Security (express-rate-limit on /api/auth/* with 5/15min IP throttling, per-user AI rate limit at 10/60s wired into assertAIAccess, email-verification gate on AI features with 2026-05-08 grandfather cutoff, password rules bumped to 10 chars + number/symbol on register and set-password); E.16 Cost Protection (PDF page cap at 30 in both Claude and OpenAI analysis paths, 25MB file size cap centralised at uploadToR2, 20-input cap per quote enforced in createInput, invokeLLM now honours caller-supplied max_tokens). TS baseline holds at 81. P1 customer-facing bugs and P2 hygiene remain. |
| 3.3 | May 7, 2026 | Pre-launch Hardening P1 customer-facing bugs shipped (E.17): team owner deletion now deactivates all team members and emails each non-owner via a new sendOrgClosedEmail template; getUserPrimaryOrg flipped to most-recently-joined membership wins so team invites work for users with an existing personal org; AdminPanel mutation buttons swept from isLoading to isPending across 6 mutations / 8 references so destructive buttons properly disable mid-request; pdfGenerator line 1544 phone-field reference corrected (companyPhone) under explicit one-line lock break. TS baseline measured against this delivery: 73 → 71 (2 errors removed, zero new errors introduced). Note: the blueprint's running baseline number had drifted from reality — actual measured baseline against the v3.2 zip was 73, not 81. Adjacent address/email field-name bugs on pdfGenerator lines 1542-1543 noted but left for the broader electrical-removal cleanup pass. P2 hygiene now the only remaining pre-launch category. |

---

*This document serves as the single source of truth for IdoYourQuotes development. Update this document when significant features are added or architecture changes.*
