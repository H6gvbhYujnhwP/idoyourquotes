# IdoYourQuotes - Complete Product Blueprint

**Version:** 3.22  
**Last Updated:** September 11, 2026  
**Status:** MVP Complete, Multi-Tenancy Complete, Production Live, Pre-launch Hardening — P0 Security & Cost Shipped, P1 Customer-facing Bugs Shipped, Anti-gaming Downgrade Shipped, PDF Org-header Field-name Cleanup Shipped, Brand Extraction Polling Shipped, Customer Email Coverage Shipped (E.21 + E.22), Sender Identity Cutover to support@mail.idoyourquotes.com Shipped (E.23), Email Verification Removed at Registration (E.24), P2 Hygiene Mostly Pending

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

**Status (May 9, 2026):** All three P0 / P1 customer-impacting categories — App Security (E.15), Cost Protection (E.16), and Customer-facing Bugs (E.17) — are shipped. E.18 changed the anti-gaming behaviour from "block second signup" to "skip free trial on second signup" and fixed the silent first-time trial bug. E.19 cleaned up PDF org-header field names. E.20 fixed brand-extraction modal polling. E.21 + E.22 closed customer email coverage gaps including the Day-14 trial-ended email, the createQuote limit-warning flag-on-failure bug, and Stripe-billing-portal tier-change recovery. E.23 made the Resend sender identity env-driven and cut the customer-facing From address over from `noreply@idoyourquotes.com` to `support@mail.idoyourquotes.com` on a newly-verified `mail.idoyourquotes.com` Resend domain. E.24 removed email verification as a hard gate at registration after the verification email kept landing in Outlook's junk folder where plain-text rendering broke the verification URL — silently killing the trial-onboarding sequence for any user whose mail server junked the first-send. Remaining work is P2 code hygiene plus the post-launch bot polish list.

#### App Security (P0) — ✅ SHIPPED in E.15 (May 7, 2026)

- [x] **Add rate limiting to all public endpoints.** Login, register, resend-verification, set-password. Currently no throttling — login brute-force is feasible (8-char passwords with no complexity rules), registration spam is unchecked, resend-verification can be hammered to spam an inbox. Recommended: 5 attempts per 15 minutes per IP with a lockout window after threshold. Express-rate-limit or similar. _Shipped: `express-rate-limit` 7.5.1 added; `authRateLimiter` mounted on `/api/auth/*` in `server/_core/index.ts`. 5 attempts / 15 min per IP, successful logins skipped. `trust proxy = 1` set so Render's X-Forwarded-For resolves correctly._
- [x] **Require email verification before AI features unlock.** Today, registering logs the user in immediately and grants full 14-day trial of all AI features regardless of verification. Gate AI feature access on `emailVerified=true` so unverified accounts can sign up and see the banner but cannot burn AI credits. Prevents fraud sign-ups (anyone with anyone's email) from costing real money. _Shipped: gate added to `assertAIAccess` helper in `server/routers.ts`. Grandfather cutoff hardcoded at 2026-05-08 UTC — anyone created before is treated as verified. Friendly error directs user to the resend banner._ **Update May 9, 2026 (E.24):** verification removed as a hard gate at registration — every new self-signup now lands with `emailVerified=true` immediately, the verification banner is removed, and the welcome email fires from the register handler instead of from a verification click. The original driver was a customer-experience problem: the verification email landed in Outlook's junk folder on a brand-new sender, where plain-text rendering wrapped the long URL across multiple lines and broke the click. Bigger underlying problem: `emailScheduler.ts` skipped every trial-lifecycle email (Day 3, Day 12, Day 14) for users where `!emailVerified`, so a single junked verification email silently killed the entire onboarding drip. The `assertAIAccess` AI gate code is left in place but is now effectively a no-op for any post-E.24 self-signup (always verified=true). The team-invite flow still uses `emailVerified=false` as a "pending password set" state — untouched. The `emailVerified` column stays in the schema, leaving the door open to reintroduce gated verification later for any specific surface (enterprise tier, billing-email confirmation, etc.) without a migration.
- [x] **Tighten password requirements.** Today: minimum 8 characters, no complexity rules. Combined with no rate limiting this is trivially brute-forceable. Bump to minimum 10 characters with at least one number or symbol. Existing weak passwords stay valid; users prompted to update on next login. _Shipped: rules updated in both `register` and `set-password` endpoints in `server/_core/oauth.ts`, plus `Register.tsx` requirement-pill display and `SetPassword.tsx` two-row hint UI._
- [x] **Per-user AI rate limit.** Even authenticated users can hit AI endpoints as fast as their network allows. Add a soft cap (e.g. 10 AI calls per minute per user) returning a 429 with a friendly retry-after. _Shipped: in-memory sliding window in `server/_core/rateLimit.ts` exposing `assertAIRateLimit(userId)`; called from `assertAIAccess` so every AI-gated endpoint inherits it. 10 requests / 60 seconds per user. Documented as needing Redis migration if Render scales to multi-instance._

#### Cost Protection (P0) — ✅ SHIPPED in E.16 (May 7, 2026)

- [x] **Cap PDF page count on quote uploads.** Currently no upper limit — a 200-page PDF triggers ~20 sequential AI calls (~£0.60 per upload), a 1,000-page PDF would trigger ~100 calls (~£3). The brochure feature has a 30-page cap; quote evidence has none. Apply the same 30-page cap with a clear "split this document" error. _Shipped: `MAX_TOTAL_PAGES = 30` constant in `server/_core/claude.ts`, enforced upfront in both `analyzePdfWithClaude` and `analyzePdfWithOpenAI` before any API spend._
- [x] **Cap file size on quote uploads.** Currently relies only on Express's 50MB JSON body cap. Add explicit per-handler check (e.g. 25MB) that returns a friendly error instead of a generic Express failure. _Shipped: `MAX_UPLOAD_BYTES = 25MB` in `server/r2Storage.ts`, applied at the `uploadToR2` choke point. Inherited by every upload path (quote inputs, brochure, logo)._
- [x] **Cap upload count per quote.** No per-quote limit on number of inputs. A single quote could accumulate hundreds of files, each triggering automatic AI processing on upload. Recommended: 20 inputs per quote with a "this quote has too many files" message. _Shipped: `MAX_INPUTS_PER_QUOTE = 20` in `server/db.ts`, enforced inside `createInput` so every input-creation path inherits it._
- [x] **Honour the support bot's reply length cap.** The bot's `max_tokens: 600` parameter is silently ignored because the underlying `invokeLLM` helper hardcodes `max_tokens` to 16384. One-line fix in `server/_core/llm.ts` to destructure and respect the parameter (other callers don't currently pass it, so they're unaffected). _Shipped: `invokeLLM` now destructures `maxTokens` / `max_tokens` and uses caller-supplied value with the existing conservative ceilings as fallback._

#### Customer-facing bugs (P1) — ✅ SHIPPED in E.17 (May 7, 2026)

- [x] **Stop orphaning team members when the Team owner deletes their account.** Today: deletion removes all team-member rows from the org but only deactivates the owner's user record. Other team members can still log in but the app finds no organisation for them and they hit cryptic "No organisation found" errors. Fix: deactivate all team members too AND send each one an email explaining the org was closed. _Shipped: deleteAccount in subscriptionRouter (folder: server/services) now captures every member's user ID before wiping the roster, deactivates the whole roster (owner + members) in a single inArray update, and queues a new "Your IdoYourQuotes team access has ended" email to each non-owner via the new sendOrgClosedEmail helper in emailService (folder: server/services). Owner still gets the existing goodbye email — unchanged._
- [x] **Fix invite flow for users who already have a personal org.** When an existing user (who signed up themselves at some point) is invited to a Team, the new membership is recorded but getUserPrimaryOrg returns the older personal org. They log in, see their old org's data, and never see the team's. The invite silently fails from their perspective. Fix: prompt invited users on next login to pick which org to view, or auto-switch them to the most recently-joined org. _Shipped: getUserPrimaryOrg in db.ts (folder: server) now orders membership rows by createdAt DESC so the most recently joined membership wins. Auto-switch behaviour is the surgical P1 fix; a full org-switcher UI remains on the Q1 Team Features roadmap._
- [x] **Disable admin destructive buttons during request.** AdminPanel mutation buttons (Delete User, Reset Password, Extend Trial, Set Tier, etc.) read isLoading from tRPC mutations — that field doesn't exist on tRPC v10+, only isPending does. So these buttons never visually disable mid-request and double-clicks fire the action twice. Particularly concerning for Delete User. Sweep all admin mutation buttons and rename isLoading → isPending. _Shipped: 8 mutation references swept to .isPending across 6 mutations in AdminPanel.tsx (folder: client/src/pages) — Delete User (×2), Reset Password, Extend Trial, Set Quota, Set Tier, Delete Org (×2). Query .isLoading references left intact (those remain correct on useQuery)._
- [x] **Fix the missing phone field on PDF generator.** pdfGenerator.ts:1544 references user.phone which doesn't exist on the User type — the actual field is user.companyPhone. Quote PDFs may be silently missing the customer's phone in one location. Pre-existing baseline TS error; worth investigating on a recent quote PDF before launch. _Shipped: line 1544 corrected to organization?.companyPhone || user.companyPhone in pdfGenerator (folder: server). Lock broken with explicit owner permission for this single-line surgical fix only. Function generateElectricalQuoteHTML at line 1532 is only reachable when quote.tradePreset === "electrical"; with the electrical sector permanently deleted this code path is dead for new quotes but still serves any historical electrical-preset quote that gets re-rendered. Two TS errors removed from the baseline._

**Adjacent issue noted, not actioned in E.17:** pdfGenerator.ts (folder: server) lines 1542 and 1543 carry the same wrong-field-name bug pattern — organization?.address and organization?.email should be organization?.companyAddress and organization?.companyEmail. Two further pre-existing TS errors. Not fixed under E.17 because the blueprint named only the phone field and the lock was unlocked for that named scope only. Worth grouping into the broader electrical-removal cleanup pass.

#### Anti-gaming downgrade + first-time trial fix (P1) — ✅ SHIPPED in E.18 (May 7, 2026)

When the anti-gaming domain check matched a previous trial signup (e.g. someone trying to register a fresh account at acme.co.uk after acme.co.uk had already had a trial), the register endpoint was hard-rejecting with "An account from your organisation already exists. Ask your team admin to invite you instead." This was too restrictive — legitimate businesses returning after a previous trial had no way to come back as paying customers without manual support intervention.

In the same area we also discovered a silent bug: the createOrganization helper never set trialEndsAt on new signups, leaving the column null. The isTrialExpired check treats null as "already expired", which means brand-new free trials may have been silently broken for any user who actually exercised the trial path (the existing test orgs are all on paid tiers, so this would only have surfaced on a brand-new genuine trial signup).

**Both fixed in E.18:**

- Register endpoint (folder: server/_core, file: oauth.ts) no longer hard-rejects when the domain check matches. Instead it sets a skipTrial flag and proceeds with registration. The new org is created with trialEndsAt set to the registration moment (so it's "expired" the instant it exists). The endpoint returns noTrial: true alongside the success payload.
- The Register page (folder: client/src/pages, file: Register.tsx) reads noTrial from the response and redirects to /pricing?trial=skipped instead of /dashboard, avoiding the jarring "empty dashboard with red expired banner" experience.
- The Pricing page (folder: client/src/pages, file: Pricing.tsx) shows a one-line amber banner above the hero when ?trial=skipped is in the URL: "Welcome — your account is ready. Your business domain has previously trialled IdoYourQuotes, so this account starts without a free trial. Choose a plan below to begin quoting."
- For genuine first-time signups (domain has never been seen before, or is on the free-email-providers list, or is on the new bypass list), createUser (folder: server, file: db.ts) now sets trialEndsAt to "registration moment + 14 days" via createOrganization. This makes the trial actually function as advertised — previously the column was left null, which the gate code treats as expired.
- A new environment variable, `ANTI_GAMING_BYPASS_DOMAINS`, holds a comma-separated list of domains exempt from the anti-gaming check. Domains in this list always get a fresh 14-day trial regardless of history. Set this in Render's environment for any domain the platform owner uses for testing the signup / trial flow (e.g. `sweetbyte.co.uk`). Empty / unset means no bypass.

#### Customer email coverage (P1) — Shipped E.21 + E.22

Discovered May 7, 2026 while diagnosing why a real Pro signup received a "your 14-day trial is active" email instead of a Pro confirmation. Two named gaps were logged at that point and a follow-up audit of the full customer email surface area uncovered four further issues (E.21, May 7). A second audit during the E.23/E.24 sender-identity work uncovered three more gaps which were fixed under E.22 (May 8).

- [x] **No subscription confirmation email after first paid checkout.** ✅ SHIPPED in E.21. New `sendSubscriptionActivatedEmail` template added in folder `server/services` (file: emailService.ts) and wired into the `checkout.session.completed` webhook handler in folder `server/services` (file: stripe.ts). Email confirms the tier name, monthly cost, what's unlocked (quote allowance, team seats, AI features), next billing date, and links to manage the subscription. Fire-and-forget so a Resend hiccup can't break webhook processing.
- [x] **Trial welcome email always claims "14-day trial active" regardless of state.** ✅ SHIPPED in E.21. The `sendWelcomeEmail` template is now state-aware, accepting one of three values: `trial-active` (the standard happy path, original copy), `paid-active` (user paid for a plan before clicking the verification link — body says "your {tier} plan is live"), or `no-trial` (E.18 domain-previously-used path — body directs the user to /pricing instead of dangling "create a quote" instructions in front of them). The verification handler in folder `server/_core` (file: oauth.ts) looks up the user's primary org and decides which state to pass; lookup failure is non-fatal and falls through to `trial-active` as a safe default.
- [x] **Stripe-initiated subscription terminations send no email.** ✅ SHIPPED in E.21. The `customer.subscription.deleted` webhook previously updated the database silently when a subscription ended due to repeated payment failure (or any Stripe-side cause). New `sendSubscriptionEndedEmail` template (folder: `server/services`, file: emailService.ts) wired into the webhook in folder `server/services` (file: stripe.ts), with a dedupe guard that captures `subscriptionCancelAtPeriodEnd` BEFORE the database overwrite — so user-initiated cancellations (which already fired `sendCancellationEmail` earlier) do not get a duplicate ended email.
- [x] **Payment failures send no email.** ✅ SHIPPED in E.21. New `sendPaymentFailedEmail` template (folder: `server/services`, file: emailService.ts) wired into the `invoice.payment_failed` webhook in folder `server/services` (file: stripe.ts). Body explains that Stripe will automatically retry over the coming days and points the user at `/settings?tab=billing` to update their card sooner. Previously the webhook silently flipped the org to past_due, blocking quote creation, and the user hit a wall the next time they tried to use the app.
- [x] **Trial expiry reminder still listed electrical content as a feature bullet.** ✅ SHIPPED in E.21. The `sendTrialExpiryReminder` template (folder: `server/services`, file: emailService.ts) had "✓ Electrical symbol counting & takeoff" in its "What you get" list — content for the permanently-deleted electrical sector. Replaced with three sector-agnostic bullets that apply to every active sector (automatic quote line-item generation, branded proposal PDFs, catalogue + pricing + team collaboration).
- [x] **Email scheduler fired Day-12 trial reminder and Day-3 check-in to no-trial orgs.** ✅ SHIPPED in E.21. The hourly email scheduler in folder `server/services` (file: emailScheduler.ts) iterated all trial-tier orgs without checking whether the trial was actually active. For orgs created via the E.18 "domain previously used → no trial" path (where `trialEndsAt` is set equal to `trialStartsAt`), it would send a generic "how's it going, try uploading a tender document" email and a bogus "your trial ends in 1 day" reminder to a user who never had a trial. New zero-length-trial guard at the top of the per-org loop skips both emails when `trialEndsAt - trialStartsAt <= 1 hour` (the +1 hour is slack for clock skew).
- [x] **Team-member password reset reused the team-invite email template.** ✅ SHIPPED in E.21. The `resetTeamMemberPassword` mutation in folder `server/services` (file: subscriptionRouter.ts) called `sendTeamInviteEmail`, which greeted an existing active user with "You've been invited to {orgName}" and "set your password and activate your account" — both wrong for a password reset on an active user. New dedicated `sendPasswordResetEmail` template (folder: `server/services`, file: emailService.ts) explains who reset the password (admin / owner name) and provides the same set-password link with the same 7-day expiry (the token mechanism is shared with the team-invite flow).
- [x] **Limit-warning email had no dedupe — sent on every dashboard refresh.** ✅ SHIPPED in E.21. The `canPerform` query in folder `server/services` (file: subscriptionRouter.ts) fired `sendLimitWarningEmail` every time the front-end queried it with usage at 80% or higher — and the front-end queries that on every quote-list refresh and every dashboard load. Now uses the same `_emailFlags` dedupe pattern that the createQuote endpoint in routers.ts uses: keys `limitApproachingSent`, `limitReachedSent` (quotes) and the new `limitUsersReachedSent` (team seats). All three flags are cleared on `invoice.payment_succeeded` in stripe.ts so emails fire fresh each billing period.
- [x] **No email when the trial actually expires (Day 14).** ✅ SHIPPED in E.22 (May 8, 2026). The Day-12 reminder fired and then nothing was sent when the trial actually elapsed — users would simply hit a paywall on their next quote attempt with no inbox heads-up. New `sendTrialEndedEmail` template added in folder `server/services` (file: emailService.ts), wired into the hourly scheduler in folder `server/services` (file: emailScheduler.ts) with a 48-hour fire window starting at trialEndsAt and a new `trialEndedSent` dedupe flag in the existing `_emailFlags` blob. The E.21 zero-length-trial guard above the new clause already filters out no-trial orgs so the email correctly does not fire for the E.18 "domain previously used" path. Body says "your 14-day trial has ended, pick a plan to keep going" and links to `/pricing`.
- [x] **routers.ts createQuote limit-warning flag-on-failure bug.** ✅ SHIPPED in E.22 (May 8, 2026). Folder `server`, file: routers.ts. Locked-add-only file; broken with explicit owner permission for a single 1-line surgical guard at the existing `sendLimitWarningEmail` post-send callback. The callback now reads the boolean return value and only writes the dedupe flag on a confirmed successful send (`if (!sent) return;`), bringing the createQuote path into symmetry with the canPerform path's E.21 dedupe in subscriptionRouter.ts. Previously a Resend hiccup at the moment a user crossed 80% would set the flag anyway and suppress the warning until the next billing period.
- [x] **Stripe billing-portal plan changes were silent.** ✅ SHIPPED in E.22 (May 8, 2026). Folders `server/services`, files: subscriptionRouter.ts and stripe.ts. The in-app upgradeSubscription / downgradeSubscription mutations now stamp a fresh `_emailFlags.tierChangeNotifiedAt` ISO timestamp onto the org BEFORE calling Stripe, and the customer.subscription.updated webhook reads that marker when it sees a real tier delta. If the marker is recent (<5 min), webhook treats this as an in-app change already emailed and skips. If missing or stale, webhook fires sendTierChangeEmail itself — that's the Stripe-billing-portal recovery path, previously silent. Webhook also gates on previousTier being a paid tier (not 'trial'), so initial activations stay handled by checkout.session.completed alone with no double-fire. Marker write happens BEFORE the Stripe API call rather than after, eliminating the race where a fast webhook could see "no marker" while in-app email is mid-flight.

#### Sender identity cutover & verification removal — ✅ SHIPPED in E.23 + E.24 (May 9, 2026)

Triggered by Resend launching `noreply@idoyourquotes.com` as the customer-facing From for two months and accumulating no replies path: customers replying went into a void. Two coordinated changes addressed both deliverability ergonomics and a post-cutover problem:

- [x] **Customer-facing sender moved from `noreply@idoyourquotes.com` to `support@mail.idoyourquotes.com`.** ✅ SHIPPED in E.23. Folder: `server/services`, file: emailService.ts. The hardcoded `FROM_EMAIL` constant became env-driven via the new `RESEND_FROM_EMAIL` Render variable, with the previous production value as fallback default — so deploying the code change alone is a zero-behaviour change. The actual cutover happened by setting `RESEND_FROM_EMAIL=IdoYourQuotes <support@mail.idoyourquotes.com>` on Render after `mail.idoyourquotes.com` was verified as a second sending domain in Resend (eu-west-1, with DKIM at `resend._domainkey.mail`, bounce path on `send.mail`, SPF on `send.mail` includes amazonses, plus a new `_dmarc.mail` record at `p=none` for monitor-only DMARC). The receiving side: `support@mail.idoyourquotes.com` is a free Workspace alias on John's existing seat, with Gmail Send-Mail-As configured (display name "IdoYourQuotes Support") so manual replies go out from the alias. The split provider architecture for `mail.idoyourquotes.com` was preserved — Resend in eu-west-1 handles all transactional sends from `support@`, AWS SES direct in eu-north-1 handles marketing campaigns from `john@`, both signed with non-conflicting DKIM selectors and aligned on the shared SPF on `mail.` (`v=spf1 include:_spf.google.com include:amazonses.com ~all`).
- [x] **Email verification removed as a hard gate at registration.** ✅ SHIPPED in E.24. Folders `server/_core`, `server/services`, and `client/src/components`; files: oauth.ts, emailScheduler.ts, DashboardLayout.tsx. Three coordinated changes. (1) The register handler now sets `emailVerified=true` on the user record immediately and fires the welcome email straight away with the same state-aware logic (paid-active / trial-active / no-trial) previously gated behind the verification click — no token generated, no verification email sent. (2) The hourly trial-lifecycle scheduler dropped the `!owner.emailVerified` skip clause; the remaining `if (!owner) continue;` guard catches the only meaningful case (missing owner record). (3) The dashboard verification banner block was removed from DashboardLayout.tsx along with its unused Mail / useState imports. The `/api/auth/verify-email` and `/api/auth/resend-verification` routes are kept in place but degraded to no-op (verify-email redirects to /dashboard, resend-verification returns success) so any pre-E.24 verification links still in inboxes don't 404 and any cached client bundles don't surface misleading errors. The team-invite flow in subscriptionRouter.ts is untouched — it dual-purposes `emailVerified=false` as a "pending password set" state and continues to work as before. The schema column stays in place. No backfill needed for existing unverified users — under the new flow the field no longer gates anything that matters. Driver: the verification email landed in Outlook's junk folder on first-send-from-a-new-sender, plain-text junk-folder rendering wrapped the long URL across lines, the click sent only the first line of the URL, the server saw a truncated token, returned `invalid-token`, and logged the user out. Underneath that surface failure the bigger problem: every trial-lifecycle email (Day 3, Day 12, Day 14) was gated behind the verification flag, so a single junked verification email silently killed the entire onboarding drip — directly hurting trial→paid conversion.

- [ ] **Remove the duplicate `server/index.ts`.** Two near-identical entry-point files exist: `server/index.ts` and `server/_core/index.ts`. Only the second one runs (per `package.json` scripts). The first is dead code that someone could waste time editing. Delete it.
- [ ] **Heal the dual-schema drift between `shared/schema.ts` and `drizzle/schema.ts`.** Per the dual-schema rule, both files should be identical. Measured on the organizations table, 16 Sep 2026: 98 columns in `shared`, 96 in `drizzle`, nothing in `drizzle` that is missing from `shared`. The two divergences are `proposal_orientation` and `trial_starts_at`, and **they need opposite treatment** — see the two dedicated items below. The runtime reads organizations through `drizzle/schema.ts`, which is why the app works today; naively copying `shared` into `drizzle` would break every organizations query if either column is absent from the database.
- [ ] **Backfill 168 historical NULL `tradePreset` rows.** Pre-existing data hygiene from earlier deliveries.
- [ ] **Resolve the dormant `proposal_orientation` column.** Pre-existing — retired in E.4 (revised) when orientation became a per-render choice saved in `branded_slots`. It is declared in `shared/schema.ts` only; `drizzle/schema.ts` does not have it, and the runtime reads organizations through `drizzle/schema.ts`, which is why nothing breaks today. **Two sources disagree on whether the column exists in the database** — this backlog entry says it was never dropped, the owner's account says it was never created. Settle it first with `select column_name from information_schema.columns where table_name='organizations' and column_name in ('proposal_orientation','trial_starts_at');` on the Render shell. Recommended fix either way: **delete the line from `shared/schema.ts`** rather than ALTER the database. That restores the dual-schema rule with no SQL, works whichever way the database turns out, and does not create a column this very backlog wants gone. Confirmed unused — the only references anywhere are its own declaration and audit-schema.sql.
- [ ] **Fix the EmailScheduler trial query — the trial drip has been silently dead.** Pre-existing, diagnosed 16 Sep 2026. `organizations.trial_starts_at` is the SECOND dual-schema divergence: declared in `shared/schema.ts`, absent from `drizzle/schema.ts`. Folder `server/services`, file: emailScheduler.ts line 50 reaches for `organizations.trialStartsAt`, gets `undefined`, and passes it to `isNotNull`. Proved by building the query against the real schema and printing the SQL: the where clause renders as `("organizations"."subscription_tier" = $1 and  is not null)` — a syntax error. Postgres rejects it, the scheduler's try/catch logs `[EmailScheduler] Error:` and returns. It runs hourly, so that line should be all over the Render logs, which is how to confirm this against production. Net effect: no Day-3 check-in and no Day-12 trial reminder has been sent for as long as the divergence has existed. **Second, independent fault underneath it:** nothing in the codebase ever WRITES `trial_starts_at`, so even with valid SQL the column is NULL for every org and the `isNotNull` filter matches nothing. Both need fixing before trial emails work. Note that adding `trialStartsAt` to `drizzle/schema.ts` removes this error from the TypeScript baseline, taking it from 69 to 68 — an owner decision, not a silent one. Also note it makes every `select` on organizations name the column, so the database must be confirmed to have it first (same query as the `proposal_orientation` item above).
- [x] **Fix the adjacent address/email/phone field-name bugs on the PDF generator org header.** ✅ SHIPPED in E.19 (May 7, 2026). The legacy electrical PDF builder reads three pieces of company data off the organisation record to put in the document header — address, email, and phone. All three used the wrong field names. Phone was fixed in E.17. Address and email fixed in E.19. Folder: server, file: pdfGenerator.ts. Two more pre-existing TS errors removed from the baseline (71 → 69). pdfGenerator.ts now reports zero TS errors. The `generateElectricalQuoteHTML` function itself remains in the codebase as dead code (only reachable on legacy electrical-preset quote re-renders) — full removal is parked under the broader electrical-removal cleanup, not actioned in E.19. The pdfGenerator.ts locked-file rule remains in force; the lock was broken with explicit owner permission for this surgical 2-line fix only.
- [ ] **Remove the wasted brand tone / font-feel AI call on Company Website URL save.** Folder: server/services. Currently every save of the Company Website URL field triggers a GPT-4o call to extract brand tone and typography "feel" from the website. The output is written to the database but no renderer reads it — the proposal pipeline ignores it entirely (the colour extraction pipeline next to it IS read; this one is not). Pure spend leak. Either wire the output into the proposal narrative / cover styling so the call earns its keep, or rip out the extraction call entirely. Decision needed before action: is the tone/feel signal still wanted as input to brochure-narrative generation, or is the brochure pipeline (E.4–E.7) considered the final authority on tone? If brochure wins, delete the AI call. If tone signal is still wanted, wire it in.

#### Bot polish (after security & cost ship)

These came out of the post-launch bot review. Lower priority because the bot is functional.

- [ ] **Add a "Retry" button to the support drawer's startup error banner.** If the initial `startThread` call fails, the chat input stays disabled forever — user has no in-app recovery path beyond closing the drawer and reopening.
- [ ] **Pop the optimistic user echo when a `sendMessage` call errors.** When a user hits the daily message cap, they see their question on screen with no reply and just an error toast — looks like the bot ghosted them rather than that they hit a limit.
- [ ] **Remove dead `refetch` in admin Conversations list.** Cosmetic — destructured but never called.
- [ ] **Update stale comment in `smtpMailer.ts` docblock.** Mentions the old `support@idoyourquotes.com` address before the alias swap.

### Sector Completeness Programme (Sep 2026 — the work between here and a real product-market-fit test)

Driven by an external appraisal of IDYQ's commercial position, checked line by line against the code on 16 Sep 2026. The appraisal's strategic reading was sound — the moat is the workflow (messy input → scope → catalogue → costs and margin → proposal → contract → Xero), not the LLM — and its advice to stop adding features and go and find twenty paying businesses is right in principle. What it could not see from a blueprint is that the product is not yet ready for that experiment to be *fair*.

**The finding that reframes the question.** IDYQ is not one sector deep and twenty-five sectors shallow. The signup dropdown was narrowed to five options on 18 Apr 2026 (`VISIBLE_TRADE_SECTOR_OPTIONS` in folder `client/src/lib`, file: tradeSectors.ts), so the go-to-market narrowing the appraisal recommends was already done seven months earlier. There are **four** go-to-market sectors — IT Services, Website & Digital Marketing, Commercial Cleaning, Pest Control — plus Other/Custom. All twenty-six sector keys remain valid at the engine level; `selectEngine()` routes them correctly regardless of dropdown visibility.

Coverage across the four, as measured on 16 Sep 2026 (before Delivery 2.14):

| Artefact | IT Services | Web & Marketing | Cleaning | Pest Control |
|---|---|---|---|---|
| Trade preset (sections + AI prompts) | yes | **none** | yes | yes |
| Starter catalogue (items, with buy-in costs) | 88 | 44 | 26 | 24 |
| Demo quote | yes | yes | yes | yes |
| Six proposal designs built | yes | yes | yes | yes |
| Designs actually reachable | yes | **no** | partly | partly |
| Proposal chapter set | IT-shaped | IT-shaped | IT-shaped | IT-shaped |
| Contract documents | Sweetbyte only | none | none | none |
| Proved end to end through Xero | yes | no | no | no |

Twenty-four proposal designs exist on disk under `server/templates/library/<sector>/<style>/`, with all twenty-four thumbnails in `client/public/template-thumbnails`. Eighteen of them were unreachable from the sector default.

**Faults found, and why they were invisible.** Two independent bugs, both fixed in Delivery 2.14 Chunk 1.

1. `tradePresetToSector()` in folder `server/services` (file: templateLibrary.ts) matched on hyphenated ids (`commercial-cleaning`) while every stored value is underscored (`commercial_cleaning`). Proved by running all 25 preset keys through it: every one returned null and fell through to the IT Services default. A second, hand-written copy of the same function inside the picker component *did* normalise underscores, so picking a design by hand worked for three sectors and the server default worked for none. Two copies of one function, one of which had drifted, each broken in a different way — which is exactly why neither was noticed.
2. `website_marketing` was offered at signup with no entry in `TRADE_PRESETS`. Twenty-six sector options, twenty-five presets. It also failed the picker's mapping, because its key normalises to `website-marketing` while its library folder is `web-marketing`.

**The structural blockers.** Two layers are hard-coded to IT and are the real reason the other sectors are not finished.

- **Proposal chapters.** One fixed set of nineteen slots in folder `server/engines` (file: brandedProposalEngine.ts), four of which are IT services with the label showing: Cloud Migration Approach, Cybersecurity & Compliance, Disaster Recovery & Continuity, Website Hosting & Support. The model is told "only include this chapter if the tender mentions cloud migration" — a soft instruction to an LLM, not a structural guarantee. A pest control company generating a branded proposal runs through a chapter list built for an MSP tender.
- **Contracts.** The shipped seeds (folder `server/services`, file: contractDocumentSeeds.ts) are Sweetbyte's own IT support agreements — IT Inventory, Cloud Backup Service, Remote Monitoring, IT Support Out of Scope, Gold and Silver tiers — and are allow-listed to org 10 only. **Correcting an earlier reading of this:** every sector *can* already produce contracts. The machinery is fully generic and multi-tenant — any org can create, name, edit, delete, sign and render contract documents, and `tier` is a slug derived from whatever the user calls the document. What the other sectors lack is a starting point, not permission. Owner's decision, 16 Sep 2026: all sectors get contracts.
- **Contract placeholders are monthly-only.** `{{monthlyFeeExVat}}`, `{{monthlyFeeIncVat}}`, `{{monthlyFee}}`, `{{firstInvoiceMonth}}`. There is no placeholder for a one-off contract value and none for annual, so a contract for a project fee with no recurring element renders a monthly fee of £0.00. Fine for an MSP, wrong for the trades sectors to be added later.

**What "complete" means.** A sector is unfinished until all seven artefacts exist. This list is the definition of done and should be treated as a checklist, not a guideline:

1. Trade preset — sections config and AI prompts
2. Starter catalogue seed, with real buy-in costs rather than sell prices alone
3. Demo quote, so a new signup sees the product working before typing anything
4. Six proposal designs
5. **A sector chapter set** — the new artefact, and the bulk of the work
6. Contract starting point — structure, plus ingestion of the business's existing terms
7. One real quote put end to end through Xero, by the owner, for a real business

**Programme — nine chunks, ordered.** Chunks 2, 3 and 4 are invisible refactors whose entire purpose is to make Chunk 5 safe; doing 5 first is how the Sorrells proposal ends up broken and a pricing table lands in the middle of someone's terms.

- [x] **1. Sector vocabulary and the mapping fix.** ✅ SHIPPED in Delivery 2.14 (Sep 16, 2026). One canonical vocabulary in folder `shared` (file: sectors.ts), both duplicate mappings replaced by it, Website & Digital Marketing given its missing trade preset.
- [x] **2. Chapter identity.** ✅ SHIPPED in Delivery 2.14 (Sep 16, 2026). Chapters carry a stable `chapterId` and an optional `role`; the magic `PRICING_SLOT_INDEX = 16` removed from all four places it lived.
- [x] **3. Sector pack registry.** ✅ SHIPPED in Delivery 2.14 (Sep 17, 2026). One entry per sector in folder `server`, file: sectorPacks.ts, naming every artefact a sector has and every artefact it does not, plus a `chapterSetId` that every sector currently points at `it-services-v1`. Sits ON TOP of the five registries rather than replacing them — the artefacts stay where they live and the pack is derived from them, so a pack cannot drift from its source. Chapter sets resolve through a new registry in the engine (`CHAPTER_SETS` / `getChapterSet`); the pack names an id rather than importing the array, because importing the proposal engine constructs an OpenAI client at module load and that must not be pulled into the registration path. Also adds `sectorCompleteness()`, the six code-checkable artefacts of the seven below, which Chunk 9 surfaces in the admin panel.
- [x] **4. Stamping and legacy handling.** ✅ SHIPPED in Delivery 2.14 (Sep 17, 2026). `BrandedSlotsState.chapterSetId` records which set produced a proposal; absence means legacy and is never back-filled. Single-chapter regeneration now resolves within the proposal's own set, preferring the chapter's stable id over its position. No schema change — the field lives inside the existing `branded_slots` json blob.
- [ ] **5. Chapter sets for Cleaning, Pest Control and Web & Marketing, plus the IT set tidy-up.** Chapter bodies support real tables as of Chunk 4b, so the new sets may name a table where one helps — a cleaning frequency schedule, a pest treatment programme, an SLA priority-to-target mapping — by appending `TABLE_GUIDANCE` to that chapter's guidance. Named chapters only; four-column cap. **Shape agreed 17 Sep 2026:** every sector shares a spine of eleven chapters (Cover, Title Page, Executive Summary, About the Supplier, What Makes Us Different, Track Record, Understanding Your Requirements, Pricing Summary, Contract Terms, Why Us, Call to Action) and differs only in the middle, so the documents stay recognisably one product and a fifth sector is mostly a matter of writing its middle. Proposed middles — Cleaning: Scope and Frequencies (table), Staffing/Vetting/Training, Equipment/Materials/Consumables, Health Safety and Compliance, Quality Monitoring and Reporting, Mobilisation Plan. Pest Control: Survey Findings and Risk Assessment, Treatment Programme (table), Monitoring and Reporting, Legal and Compliance, Health and Safety. Web & Marketing: Proposed Approach and Deliverables, Design and Build Process (conditional), Ongoing Marketing Services (conditional), Hosting Support and Maintenance, Measurement and Reporting, Timeline and Milestones. **The remaining content faults are folded in here** (owner's decision, 17 Sep 2026, having taken the start-date fix separately as 4c): the Key Personnel confession, chapters that spend a page explaining their own irrelevance, and the raw quote reference in prose. Doing them alongside the new sets establishes each pattern once rather than twice. NOTE the mechanism for dropping an irrelevant chapter already exists and works — the prompt tells the model to return an empty body where a chapter's guidance says "only include if…", and the assembler skips empty-bodied chapters. Cloud Migration and Website Hosting carry that condition and correctly vanish; Cybersecurity and Disaster Recovery do not, which is why they stay and argue. The fix is guidance, not machinery. The first chunk a customer would notice. Sets need not be the same length. **Fold the outstanding generated-content faults into this chunk** — they live in the same guidance strings: Key Personnel telling the client that the brochure names nobody, the raw quote reference leaking into Contract Terms, and the invented service start date contradicting the Acceptance page.
- [ ] **6. Contract placeholders for one-off and annual values.** Small, independent of the proposal track, and a prerequisite for any sector that bills once.
- [ ] **7. Contract skeletons per sector.** Headings and structure with empty bodies, plus guidance shown in the editor and never printed. Replaces the blank page. The policy that IDYQ must not author another business's legal wording stays in force.
- [ ] **8. Contract ingestion.** Upload the terms the business already uses and have them split into numbered clauses ready to edit. Same pattern as brochure ingestion (folder `server/services`, file: brochureExtractor.ts), different output schema. This is what actually makes contracts work for a new customer; the skeleton only helps those with nothing to upload.
- [ ] **9. Sector completeness in the admin panel, and the four real end-to-end runs.** Makes "is this sector done" a fact rather than an opinion. The runs are not a coding task and will find what the other eight missed.

**Deliberately not in this programme.**

- The other twenty-one sectors, until the four are finished and the sector-pack shape has survived contact with reality. Owner's position (16 Sep 2026): more sectors are wanted, but only after the four are complete.
- Shipped contract clause *wording*. If it is ever wanted, it is an additive chunk after 8, gated: clauses marked as drafts until the org explicitly adopts them, a one-time acknowledgement that they have been reviewed, and the acknowledgement recorded — turning "IDYQ wrote your contract" into "IDYQ gave you a draft and you adopted it".

**Sequencing note on Stripe.** The new Stripe account is deliberately last, since no new customers are wanted yet. One decision belongs *before* it rather than after: whether pricing is flat across sectors or varies by sector. The appraisal's observation that a £29 plumber and a £300/month MSP have very different willingness to pay is the right instinct, and restructuring Stripe products after the fact is unpleasant. Pre-revenue with no live customers is a completely free hand; it is worth using deliberately rather than defaulting to the blueprint's £29 / £59 / £119.

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
| 3.3 | May 7, 2026 | Pre-launch Hardening P1 customer-facing bugs shipped (E.17): team owner deletion now deactivates all team members and emails each non-owner via a new sendOrgClosedEmail template (folder: server/services); getUserPrimaryOrg flipped to most-recently-joined membership wins so team invites work for users with an existing personal org (folder: server); AdminPanel mutation buttons swept from isLoading to isPending across 6 mutations / 8 references so destructive buttons properly disable mid-request (folder: client/src/pages); pdfGenerator line 1544 phone-field reference corrected (companyPhone) under explicit one-line lock break (folder: server). TS baseline measured against this delivery: 73 → 71 (2 errors removed, zero new errors introduced). Note: the blueprint's running baseline number had drifted from reality — actual measured baseline against the v3.2 zip was 73, not 81. Adjacent address/email field-name bugs on pdfGenerator lines 1542-1543 noted but left for the broader electrical-removal cleanup pass. P2 hygiene now the only remaining pre-launch category. |
| 3.4 | May 7, 2026 | Anti-gaming behaviour changed from "block second signup" to "downgrade second signup" plus first-time trial bug fix shipped (E.18). Previously when a business domain had been used for a previous trial, a fresh registration on that domain hard-rejected with a 409 and the message "An account from your organisation already exists". Now the user can register normally — the new org is created with trialEndsAt set to the registration moment (so it's already expired), and the API returns noTrial: true. The Register page reads this and redirects to /pricing?trial=skipped instead of /dashboard. The Pricing page shows a one-line amber banner explaining that the domain has previously trialled the product and the new account starts without a free trial. Folders touched: server/_core (oauth.ts and sdk.ts), server (db.ts), client/src/pages (Register.tsx and Pricing.tsx). New environment variable `ANTI_GAMING_BYPASS_DOMAINS` (comma-separated list, set in Render env) exempts owner-owned testing domains from the anti-gaming check entirely. Piggyback fix: createOrganization now accepts an optional trialEndsAt parameter and createUser sets it to "registration moment + 14 days" for first-time signups, fixing a silent bug where trialEndsAt was being left null on every signup — the isTrialExpired gate treats null as "already expired", which would have silently broken the 14-day trial for any genuine first-time business signup (only not-yet-noticed because all existing test orgs are on paid tiers). TS baseline holds at 71. P2 hygiene now the only remaining pre-launch category. |
| 3.5 | May 7, 2026 | PDF generator org-header field-name cleanup shipped (E.19). Folder: server, file: pdfGenerator.ts. The legacy electrical PDF builder's company-header block (the "from" details that print at the top of a generated quote PDF) referenced three nonexistent fields on the organisation type — `organization?.address`, `organization?.email`, `organization?.phone`. Phone was fixed in E.17 under explicit lock break for the named scope only. Address and email fixed in E.19 under a second explicit lock break. Both fields renamed to their correct schema names: `companyAddress` and `companyEmail`. Two TS errors removed from the baseline (71 → 69). pdfGenerator.ts now reports zero TS errors of its own. The locked-file rule on pdfGenerator.ts remains in force — the lock was broken twice for surgical field-name fixes, but routine work on the file still requires explicit permission. The dead `generateElectricalQuoteHTML` function plus its call site at line 611 remain in the codebase, parked under the broader electrical-removal cleanup. Only the wasted brand tone / font-feel AI call remains on the P2 hygiene list as a high-impact item. |
| 3.6 | May 7, 2026 | Brand extraction polling fix shipped (E.20) plus customer email coverage gaps discovered and logged for next session. Folder: client/src/components, file: BrandChoiceModal.tsx. The "How should it look?" modal queries the org once on open; if the brand extraction was still pending at that moment (logo just uploaded, server-side colour and tone extraction still running), React Query cached `brandExtractionStatus = "pending"` and never refetched, leaving the modal showing "Refining…" forever even after the server flipped status to "ready". Fix: added a `refetchInterval` to the orgProfile query that polls every 2 seconds while status is pending and stops automatically once status flips. One-line addition, zero TS impact. While diagnosing this, also discovered two customer-facing email coverage gaps and added them as new P1 items under "Customer email coverage" in the Pre-launch Hardening section — (a) no subscription confirmation email after first paid Stripe checkout, (b) trial welcome email always claims "14-day trial active" regardless of whether the user's org actually has a trial. Both gaps need addressing before launch. TS baseline holds at 69. |
| 3.7 | May 7, 2026 | Customer email coverage pass shipped (E.21). Five files touched. Folder `server/services` (file: emailService.ts) gained four new templates (`sendSubscriptionActivatedEmail`, `sendPaymentFailedEmail`, `sendSubscriptionEndedEmail`, `sendPasswordResetEmail`), plus `sendWelcomeEmail` rewritten as state-aware (trial-active / paid-active / no-trial) and `sendTrialExpiryReminder` had its electrical-sector feature bullet replaced with sector-agnostic content. Folder `server/_core` (file: oauth.ts) — verify-email handler now resolves the user's primary org and decides which welcome state to pass, with non-fatal fallback to trial-active if the lookup fails. Folder `server/services` (file: stripe.ts) — `checkout.session.completed` now fires the new subscription-activated email; `invoice.payment_failed` fires the new payment-failed email; `customer.subscription.deleted` fires the new subscription-ended email but dedupes against user-initiated cancels by reading `subscriptionCancelAtPeriodEnd` BEFORE the database overwrite (user-cancelled flow already fired sendCancellationEmail at click time, so the new ended email only fires for Stripe-side terminations). Folder `server/services` (file: emailScheduler.ts) — zero-length-trial guard skips Day-3 check-in and Day-12 trial reminder for orgs where `trialEndsAt - trialStartsAt <= 1 hour` (the E.18 no-trial path). Folder `server/services` (file: subscriptionRouter.ts) — `resetTeamMemberPassword` switched from the team-invite email template to the new password-reset template, and the `canPerform` quote and team-member limit warnings are now wrapped in the same `_emailFlags` dedupe pattern that routers.ts uses (new flag `limitUsersReachedSent` introduced for team-seat limit). All three flags are cleared on `invoice.payment_succeeded` in stripe.ts so emails fire fresh each billing period. TS baseline holds at 69 — verified after each file. No locked files modified. routers.ts not touched. |
| 3.8 | May 8, 2026 | Three customer-email coverage fixes shipped (E.22). (1) Day-14 trial-ended email — new `sendTrialEndedEmail` template added in folder `server/services` (file: emailService.ts), wired into the hourly scheduler in folder `server/services` (file: emailScheduler.ts) with a 48-hour fire window starting at trialEndsAt and a new `trialEndedSent` dedupe flag in the existing `_emailFlags` blob. The E.21 zero-length-trial guard above the new clause already filters out no-trial orgs so the email correctly does not fire for the E.18 "domain previously used" path. Closes the gap where the Day-12 reminder fired and then nothing was sent when the trial actually expired — users would simply hit a paywall on their next quote attempt with no inbox heads-up. (2) routers.ts createQuote limit-warning flag-on-failure fix — folder `server`, file: routers.ts. Locked-add-only file; broken with explicit owner permission for a single 1-line surgical guard at the existing `sendLimitWarningEmail` post-send callback. The callback now reads the boolean return value and only writes the dedupe flag on a confirmed successful send (`if (!sent) return;`), bringing the createQuote path into symmetry with the canPerform path's E.21 dedupe in subscriptionRouter.ts. Previously a Resend hiccup at the moment a user crossed 80% would set the flag anyway and suppress the warning until the next billing period. (3) Stripe billing-portal tier-change recovery — folders `server/services`, files: subscriptionRouter.ts and stripe.ts. The in-app upgradeSubscription / downgradeSubscription mutations now stamp a fresh `_emailFlags.tierChangeNotifiedAt` ISO timestamp onto the org BEFORE calling Stripe, and the customer.subscription.updated webhook reads that marker when it sees a real tier delta. If the marker is recent (<5 min), webhook treats this as an in-app change already emailed and skips. If missing or stale, webhook fires sendTierChangeEmail itself — that's the Stripe-billing-portal recovery path. Webhook also gates on previousTier being a paid tier (not 'trial'), so initial activations stay handled by checkout.session.completed alone with no double-fire. Marker write happens BEFORE the Stripe API call rather than after, eliminating the race where a fast webhook could see "no marker" while in-app email is mid-flight. TS baseline holds at 69. No locked files modified beyond the named one-line scope on routers.ts. |
| 3.9 | May 8, 2026 | E.23 — Resend sender identity made env-driven (folder `server/services`, file: emailService.ts). Single constant at the top of the file (`FROM_EMAIL`) now reads from `RESEND_FROM_EMAIL` with `IdoYourQuotes <noreply@idoyourquotes.com>` (the pre-E.23 production value) as fallback. Deploying this change alone was a zero-behaviour change — the cutover from `noreply@idoyourquotes.com` to `support@mail.idoyourquotes.com` happened via a Render env-var set, after `mail.idoyourquotes.com` was verified as a second Resend domain in eu-west-1 (DKIM at `resend._domainkey.mail`, bounce path on `send.mail`, SPF on `send.mail` includes amazonses, plus a new `_dmarc.mail` TXT record at `p=none` for monitor-only DMARC). Customer replies to support@ land in John's existing Workspace mailbox via a free alias on `mail.idoyourquotes.com`; outbound replies from John's mailbox use Workspace's Send-Mail-As feature on the same alias with the display name "IdoYourQuotes Support". The split provider architecture for `mail.idoyourquotes.com` was preserved — Resend in eu-west-1 handles transactional, AWS SES direct in eu-north-1 handles marketing campaigns from `john@`, non-conflicting DKIM selectors, shared SPF on `mail.`. TS baseline holds at 69. No locked files touched. |
| 3.10 | May 9, 2026 | E.24 — email verification removed as a hard gate at registration. Files: server/_core/oauth.ts, server/services/emailScheduler.ts, client/src/components/DashboardLayout.tsx. Three coordinated changes. (1) The register handler now sets emailVerified=true on the user record immediately and fires the welcome email straight away with the same state-aware logic (paid-active / trial-active / no-trial) previously gated behind the verification click — no token generated, no verification email sent. The /api/auth/verify-email and /api/auth/resend-verification routes are kept in place but degraded to no-op (verify-email redirects to /dashboard, resend-verification returns success) so any pre-E.24 verification links still in inboxes don't 404 and any cached client bundles still calling resend don't surface misleading errors. (2) The hourly trial-lifecycle scheduler in emailScheduler.ts no longer skips users where !owner.emailVerified — that filter was silently killing the entire trial drip (Day 3 check-in, Day 12 reminder, Day 14 trial-ended) for any user whose verification email landed in spam. The remaining `if (!owner) continue;` guard catches the only meaningful case (missing owner record). (3) The dashboard verification banner block has been removed from DashboardLayout.tsx along with its unused Mail / useState imports. The team-invite flow in subscriptionRouter.ts is completely untouched — it dual-purposes emailVerified=false as a "pending password set" state and continues to work as before. The schema column stays in place, leaving the door open to reintroduce gated verification later for any specific surface (enterprise tier, billing-email confirmation, etc.) without a migration. Driver: verification email landed in Outlook's junk folder on first-send-from-a-new-sender, plain-text junk-folder rendering wrapped the long URL across lines, click sent only the first line of the URL, server saw a truncated token, returned `invalid-token`, and logged the user out. Underneath that surface failure the bigger problem: every trial-lifecycle email was gated behind the verification flag, so a single junked verification email silently killed the entire onboarding drip — directly hurting trial→paid conversion. TS baseline holds at 69. No locked files touched. No backfill needed for existing unverified users — under the new flow the field no longer gates anything that matters. |
| 3.11 | Sep 11, 2026 | VAT fix — delivery 1 of the Xero repeating-invoices sequence (2 = contracts made per-business, 3 = Xero). Root cause: Settings pre-filled the VAT box with 20 when nothing had ever been saved, so organisations that never pressed Save had no stored rate while the screen claimed 20%; their new quotes silently got 0%. Render check on 11 Sep found orgs 3, 4 and 13 with no stored rate and 50 zero-VAT quotes across all five (all test orgs, no real customers). 0% was also read four different ways: colour-template proposal promoted it to 20%, brochure proposal treated it as no VAT, contract printed 'including VAT at 0%', terms clause said 'No VAT is applicable'. New single helper (folder server/services, file: vatRate.ts): organisation rate lives in defaultDayWorkRates.defaultVatRate, 0 = not VAT registered, absent reads as 20; a quote's 0% means no VAT applicable and is never promoted; formatVatRate prints 20 as '20' and 17.5 as '17.5'. Folder server, file: db.ts — createOrganization stamps defaultVatRate 20 on every new org; createQuote takes the org's rate whenever the caller supplies none (covers the demo-quote seeder); an explicit caller rate including 0 is always respected. Folder client/src/pages, file: Settings.tsx — VAT number box replaced by an explicit 'VAT registered' / 'Not VAT registered' choice, rate field only when registered, validated before save. Folder server/services, file: slotContentBuilder.ts — colour-template pricing table no longer turns 0 into 20; at 0 it keeps four columns with dashes and a 'No VAT applicable' footer. Folder server, file: docxGenerator.ts — Word export totals rebuilt to mirror recalculateQuoteTotals: previously every line (monthly, annual, optional included) was summed and VAT charged on the lot; now VAT applies to the one-off subtotal only, monthly and annual are stated per period (+ VAT when registered), optional lines are excluded and noted, each table row carries its cadence ('(per month)', '(per year)', '(optional)'), and 0% prints 'No VAT applicable'. Folder server, file: pdfGenerator.ts — LOCK BROKEN with explicit owner permission (11 Sep 2026) for the three live VAT totals rows only: simple quote PDF and comprehensive proposal totals now show 'No VAT applicable' / 'Total' at 0% instead of a 'VAT (0%)' row, the rate label no longer rounds 17.5 to 18, and the comprehensive Financial Summary label no longer prints '20.00%'. The dead electrical builder's VAT row is untouched. The lock remains in force. Folder server/services, file: brandedProposalRouter.ts — contract: dead '?? 20' fallback replaced by the helper; new {{monthlyFee}} placeholder renders '£X + VAT (£Y including VAT at 20%)' or '£X (no VAT applicable)'; the shipped three-placeholder fee phrase is collapsed to {{monthlyFee}} before filling, so Sweetbyte's Gold and Silver wording is byte-identical at 20% and correct at 0%. Folder client/src/components, file: ContractDocumentsTab.tsx — {{monthlyFee}} added to the placeholder help list. Data: repo root, file: migration-vat-backfill.sql — idempotent single transaction, tested on Postgres 16: orgs with no stored rate get 20 (other JSON keys preserved, explicit 0 untouched); zero-VAT quotes in registered orgs get the org rate with tax_amount and total recalculated as recalculateQuoteTotals does. Xero note: the integration will send ex-VAT line prices and let Xero calculate VAT; IDYQ's VAT figure is never sent. Not touched: routers.ts, QuoteWorkspace.tsx, AdminPanel.tsx. Legacy modern/bold/structured templates and brandedProposalRenderer.ts still label the one-off total 'inc. VAT' at 0% — parked with the legacy-renderer cleanup. Also found: contract_documents has zero rows for every org, confirming the contract-documents sub-router has never been mounted live (apply-contractdocument-router.mjs unapplied); delivery 2 mounts it after restricting Gold/Silver seeding to Sweetbyte (org 10). TS: the zip measures 81 because of that missing mount (12 errors, all 'contractDocument does not exist' in ContractDocumentsTab.tsx and BrandedProposalWorkspace.tsx); this delivery holds 81 with per-file distribution and messages identical, and with the mount applied on a scratch copy measures exactly 69, identical to the pre-delivery 69 distribution. Production build verified. |
| 3.12 | Sep 11, 2026 | Contracts made per-business — delivery 2 of the Xero repeating-invoices sequence. Problem: the Gold and Silver contract documents (folder server/services, file: contractDocumentSeeds.ts) are Sweetbyte's own live contracts — SLA hours, onsite allowance, 90-day notice, Direct Debit wording — and were seeded into every organisation on first read, so any other business would have issued Sweetbyte's terms under its own name. Folder server/services, file: contractDocumentRouter.ts — seeding now only for org ids in the new Render setting CONTRACT_SEED_ORG_IDS (comma-separated; set to 10; unset = nobody seeded), and only when the org has no documents at all, so a deleted document is never resurrected; new create (user-named document, key derived from the name and made unique, no clauses, neutral acceptance paragraph using {{monthlyFee}}, max 20 per org) and remove endpoints; list returns shippedDefaults; resetTier refuses unless the org is allow-listed and the tier has a shipped version. Folder client/src/components, file: ContractDocumentsTab.tsx — 'Add your first contract' empty state, 'Add contract' beside the switcher, 'Delete contract', 'Reset to default' only on documents with a shipped version, labels use the owner's own names (Sweetbyte keeps Gold / Silver), signatory card always shown. Folder client/src/pages, file: BrandedProposalWorkspace.tsx — contract dialog: one contract shows its name with no picker, several show a picker of the business's own names, a deleted selection is re-picked. Folder server/services, file: brandedProposalRouter.ts — renderContract refuses a contract with no clauses (would print an empty terms page) with a pointer to Settings. Folder server, file: routers.ts — contract-documents sub-router mounted (add-only: one import, one mount; zero existing lines changed). This supersedes apply-contractdocument-router.mjs (repo root), which was never run; re-running it now reports already-patched. Contracts run live for the first time with this delivery. Verified against a scratch Postgres built from shared/schema.ts using the real router: Sweetbyte seeded with 12 clauses per package, another org empty, name-to-key and duplicate names, delete, deleted package not resurrected, reset allowed for Sweetbyte and refused for others, one org unable to delete another's rows, unset setting seeds nobody. Not changed: routers.ts existing procedures, QuoteWorkspace.tsx, AdminPanel.tsx, pdfGenerator.ts. Noted, not changed: contract endpoints have no owner/admin role check (any member can edit or delete legal documents) — pre-existing. TS: exactly 69, per-file distribution and messages identical to the 69 measured with the mount on a scratch copy before delivery 1. Production build verified. |
| 3.13 | Sep 11, 2026 | Delivery 2.5 — new-line bullets and client-facing descriptions, ahead of Xero. (1) Separator: line-item descriptions used '||' (bullets) and '##' (numbered); only the quote PDF formatted them — Word, the colour-template proposal and Xero would print them raw, and the workspace showed one long paragraph. New format: first line = summary, each further line = a bullet, a line starting '1. ' = a numbered step. One shared rule (folder shared, file: lineItemDescription.ts — parse, summary, text, normalise; legacy '||' / '##' still understood everywhere) now drives: pdfGenerator.ts formatLineItemDescription (folder server; LOCK BROKEN with explicit owner permission for that function only, markup unchanged), brandedProposalAssembler.ts summary (folder server/services; also keeps line breaks away from pdf-lib), slotContentBuilder.ts pricing table (folder server/services; previously printed raw '||'), docxGenerator.ts (folder server; multi-line table cells, cadence tag on the summary line), brandedProposalRenderer.ts plainLineItemText (folder server; legacy templates), brandedProposalEngine.ts prompt formatter (folder server/engines). Catalog.tsx (folder client/src/pages): description cells edit in a textarea (Enter = new line, Ctrl/Cmd+Enter or blur saves, Escape cancels) — the old single-line input would have silently flattened bullets on edit; Add Item description is a textarea; display shows line breaks; seed picker uses the shared summary. The quote workspace needed no change (its description editor is already an auto-growing textarea). generalEngine.ts (folder server/engines): prompt now requires line breaks and forbids '||', '##' and bullet characters; every '||' instruction and example rewritten; model output normalised to the new format before saving whatever it emits; multi-line catalogue descriptions indented beneath their item in the COMPANY CATALOG prompt list (list built in locked routers.ts, tidied in the engine; byte-identical prompt for single-line catalogues). Starter catalogues (folder server/catalogSeeds, 4 files, 182 descriptions) and demo quotes (folder server/demoQuotes, 4 files, 21) converted, each verified to parse identically before and after. Data: repo root, file: migration-description-newlines.sql — converts quote_line_items and catalog_items; tested on Postgres 16 against all 208 original seed/demo descriptions (all identical under the shared parser), idempotent, one transaction. (2) Client-facing descriptions: the AI draft was writing notes to the quoter into descriptions (Q-205: 'NOTE: … confirm with client', 'catalog rate is £32.99', 'assumed = 30 users'), which print on every document and would repeat on Xero invoices. generalEngine.ts prompt now marks descriptions client-facing and routes such notes to the engine's 'notes' field. OPEN: the main draft path in locked routers.ts discards the engine's 'notes', so they are not yet saved to the Internal tab — needs owner permission to add that inside generateDraft. Existing quotes keep their notes until edited; the Xero step (delivery 3) will warn on descriptions containing such wording. Not touched: routers.ts, QuoteWorkspace.tsx, AdminPanel.tsx. TS: exactly 69, per-file distribution and messages identical. Production build verified. |
| 3.14 | Sep 14, 2026 | Delivery 2.6b — stored documents and bulk catalogue categories. (1) Stored documents: a rendered PDF only ever existed in browser memory, so pressing Back lost it and the user had to re-render (re-spending AI credits) to look at it again. New column quotes.generated_documents (json; folder repo root, file: migration-generated-documents.sql — additive, IF NOT EXISTS, idempotent, run BEFORE deploy; no backfill, NULL = nothing generated). Dual-schema: shared/schema.ts holds GeneratedDocument / GeneratedDocuments types plus the column; drizzle/schema.ts re-exports the types and adds the column. Folder server/services, file: brandedProposalRouter.ts — storeGeneratedDocument() uploads each renderPdf / renderContract result to R2 and records it (latest-only per kind; the previous file is deleted after the new entry is written, never before); best-effort and never throws, so a storage failure still leaves the user their download. New listDocuments (returns each stored doc with a DERIVED stale flag: quote.updatedAt or any line item's updatedAt later than generatedAt — so edits from any path count without each edit path having to flag anything) and getDocumentUrl (presigned on demand, never stored). Folder client/src/pages, file: BrandedProposalWorkspace.tsx — Documents panel with View / Regenerate per document and a 'Quote edited since' warning; nothing ever regenerates automatically. NOT stored, by design and by Wez's choice: the Word export (built from the live quote on every click, so always current) and the plain quote PDF (server returns HTML, the browser's print dialog makes the PDF — no PDF bytes ever reach the server; the button and its handler are in locked QuoteWorkspace.tsx and routers.ts generatePDF, so storing it needs both a real server-side render and lock permission — NOT done, open). (2) Catalogue: CORRECTION to an earlier claim in this session — a per-row Category dropdown (CategoryCell) already existed and works, including for uncategorised items ('Uncategorized' is a real rendered group). What was missing is bulk change. Folder client/src/pages, file: Catalog.tsx — per-row and per-category selection checkboxes plus a sticky 'N selected / Move to category… / Apply' bar; uses the existing catalog.update endpoint item-by-item in batches of 5 (no new endpoint, routers.ts untouched), reports moved vs failed, and keeps the selection when any item failed. Not changed: routers.ts, QuoteWorkspace.tsx, pdfGenerator.ts. TS: exactly 69, per-file distribution identical. Production build verified. Migration tested on Postgres 16 including re-run. |
| 3.15 | Sep 14, 2026 | Delivery 2.7 — quoting accuracy. Found by replaying the real Sorrells order through Generate Draft (Q-206): 11 of 13 rates were correct, but Copilot came back at the catalogue's £19.32 instead of the stated £26.52 (£21.60/month understated), discounts were baked into the rate with the arithmetic printed to the client, and units drifted from the order. (1) PRICE PRECEDENCE (folder server/engines, file: generalEngine.ts): a price or unit STATED in the evidence now beats the catalogue defaultRate; the catalogue fills gaps only. Scoped deliberately — competitor pricing on a tender or takeover still loses to the catalogue, and the anti-fabrication rule is otherwise unchanged. Wez's choice: use the stated price silently and record the difference, rather than prompting per line. (2) DISCOUNTS: engine emits the FULL rate plus discountPercent (folder server/engines, file: types.ts — new discountPercent and catalogPriceDiffers on EngineOutputMaterial) instead of pre-multiplying; prompt forbids writing the discount, list price or arithmetic into the description. (3) Folder server, file: routers.ts — LOCK BROKEN with explicit owner permission (14 Sep 2026), scoped to the generateDraft procedure; exactly ONE existing line changed (total = qty x rate becomes qty x rate x (1 - disc/100), mirroring the manual line-item endpoint: clamped 0-100, stored null not '0'). Also threads discountPercent / catalogPriceDiffers from QDS materials, persists discountPercent at line creation, and saves the engine's notes + generated stated-price-difference notes to the internal estimate (wrapped in try/catch — the quote and lines are already saved by that point). (4) Folder client/src/pages, file: QuoteWorkspace.tsx — LOCK BROKEN with the same permission, scoped to one new panel; ZERO existing lines changed (the ternary branch holding EditorPanel was wrapped in a fragment to admit a sibling). New DraftNotesPanel: collapsed 'Notes from the draft', internal only, renders nothing when there are no notes. Fixes the root cause of Q-205 — the engine had a notes field, the server discarded it, so the AI wrote quoter-facing notes into client-facing descriptions. NOT a code fix: the 'Payment terms: 50% deposit, 50% on completion' on Sweetbyte's quotes is the org's own Default Terms in Settings, never changed from the starter wording — the AI reproduces DEFAULT TERMS verbatim as instructed. Wez to edit it in Settings. Verified by replaying the pricing logic on the real Sorrells lines: £391.60 and £97.90 (11% discounts) match the manual contract to the penny, Copilot lands on £79.56, a >100% discount clamps to 100, and the price-difference note fires correctly. Not touched: pdfGenerator.ts (the Discount column already printed — it had simply never been given anything to show), AdminPanel.tsx. TS: exactly 69, per-file distribution identical. Production build verified. |
| 3.16 | Sep 14, 2026 | Delivery 2.8 — proposal finishing. Driven by comparing IDYQ's Q-207 branded PDF (16pp) against Sweetbyte's manual Sorrells contract (18pp). (1) Back cover: the proposal opened with brochure page 1 (Cover slot) but had no closing page, so it simply stopped after the last chapter. Folder server/services, file: brandedProposalAssembler.ts — new includeBackCover param appends the brochure's LAST page, through the same copyPages / letterbox path as the cover, AFTER any contract terms and signature pages; skipped when the brochure has one page (it is already the cover). Applies to proposals and contracts. (2) Orphan total: the pricing table reserved only the row's own height, so a final row that fitted exactly pushed the group total onto a page of its own (Q-207 p14 carried nothing but 'Monthly total (ex VAT) £1,370.51'). The last row of each group now reserves the subtotal's height too. Verified by sweeping 200 start positions: 10 produced an orphan before, 0 after. (3) Chapter removal: the generated set is 18 slots; Q-207 carried 'Cloud Migration Approach' and 'Website Hosting & Support' for a deal containing neither, and chapters could be edited but not removed. Folder client/src/pages, file: BrandedProposalWorkspace.tsx — per-chapter delete (hover-revealed, confirms first; the pricing chapter is exempt). (4) Chapter persistence: edits lived in browser memory only — a refresh discarded them AND re-ran draft generation, re-spending AI credits. New column quotes.branded_slots (json; folder repo root, file: migration-branded-slots.sql — additive, IF NOT EXISTS, idempotent, run BEFORE deploy; NULL = never opened, so the workspace generates a fresh draft as before). Dual-schema: BrandedSlotsState type in shared/schema.ts, re-exported by drizzle/schema.ts. New saveSlots / loadSlots in brandedProposalRouter.ts (whole-state replace, not per-chapter merge — a merge could resurrect a chapter the user had just removed); the workspace restores saved state ahead of generating, and saves after each chapter edit, removal, orientation or date change and before every render. Saves are best-effort and never block editing or rendering. (5) Cover date: the title page always printed today, so re-rendering a contract agreed on 22 August restamped it. New optional coverDate (yyyy-mm-dd) on renderPdf and renderContract, with a date control in the toolbar; blank = today, exactly as before. (6) Folder server/engines, file: brandedProposalEngine.ts — SLA chapter guidance now forbids inventing support hours, response times or onsite allowances (Q-207 printed 'Mon-Fri 9-5' for a service contracted at 8:30am-5:30pm). Not touched: routers.ts, QuoteWorkspace.tsx, pdfGenerator.ts. TS: exactly 69, per-file distribution identical. Production build verified. Migration tested on Postgres 16 including re-run. |
| 3.17 | Sep 14, 2026 | Delivery 2.9 — proposal workspace fixes, chapter recovery, and the Green Agents scrub. Driven by owner testing of 2.8. (1) CHAPTER EDITS WERE NEVER SAVED: folder client/src/pages, file BrandedProposalWorkspace.tsx — handleSaveEdit updated React state and returned. Every other editing path (regenerate, removal, cover date, both render buttons) called persistSlots; the Save button was the one that didn't, so an edit followed by a refresh was discarded, branded_slots stayed NULL, and the workspace generated a fresh draft — 30-60s and different wording. Now persists. Second fault in the same effect: the restore step bails while the loadSlots query is in flight, but that query was absent from the dependency array, so if it resolved after the brochure query nothing re-ran the restore; savedSlots.isLoading and savedSlots.data added to the deps. (2) CHAPTER REMOVAL IS NOW RECOVERABLE: 2.8 filtered the chapter out of the array — unrecoverable, the only way back was regenerating the whole draft. New optional `excluded` flag on ChapterSlot (folder server/engines, file brandedProposalEngine.ts, plus the client's mirror type) with a new includedSlots() helper. The chapter stays in the list greyed and struck through with a "Left out" badge and an undo control that stays visible (not hover-only) so the way back isn't hidden; the chapter pane shows a banner with "Put it back"; the full list including excluded chapters is what gets saved, the filtered list is what gets rendered. Folder server/services, file brandedProposalRouter.ts — `excluded` added to both arms of ChapterSlotSchema (z.object strips unknown keys, so without it the flag would be dropped on save and the chapter would reappear), and includedSlots applied inside renderPdf and renderContract so a stale browser tab can't push an excluded chapter into a PDF. Absent flag = included, so pre-2.9 saved states read correctly. (3) BLANK PAGE AFTER THE PRICING TABLE: folder server/services, file brandedProposalAssembler.ts — the headline totals strip's fallback branch was gated on `lineItems.length > 0`, so it fired for any quote with no one-off lines INCLUDING a 20%-VAT one; it reserved space (forcing a new page, the table having filled the last), drew the top rule, then printed nothing because every row below is gated on a one-off subtotal. The 14 Sep Sorrells contract carried an empty page 13 of 18. Guard changed to `totals.oneOffSubtotal > 0`. Recurring-only quotes need no strip — each group's own subtotal already states the monthly/annual figure. (4) EVERY CHAPTER STARTS ITS OWN PAGE: same file — E.4.2 chapter consolidation removed at the owner's instruction. Short chapters no longer flow onto the previous chapter's page below a separator (Q-207 put "Cybersecurity & Compliance" under the tail of "Proposed Service Delivery"). drawChapter's flow machinery is left in place but is never handed a prior-page cursor. Documents get longer; that matches Sweetbyte's manual contracts. (5) CONTRACT TITLE PAGE: the wording substitution table only rewrites phrases like "in this proposal", so a signed agreement was still headed "Proposal for <client>" at 32pt. New applyTitlePageContractWording in brandedProposalRouter.ts rewrites the FIRST non-empty line of the Title Page slot only — ordinary prose using the word "proposal" is untouched. (6) Stale header badge "Edits live in this session" now reads "Edits saved automatically". (6b) PRICING_SLOT_INDEX in BrandedProposalWorkspace.tsx corrected from 15 to 16. E.4.3 split the Cover slot into Cover + Title Page and renumbered every later slot by one; the server constant moved to 16 but the client's mirror was never updated. Live consequences: the EDITABLE badge sat on "Key Personnel" (the real slot 15), and 2.8's delete control — which exempts pricing — appeared on Pricing Summary and was hidden on Key Personnel, so the pricing chapter was deletable. Found while proving this delivery: the proof quote's pricing table never drew, because the assembler dispatches on the server's 16. (7) GREEN AGENTS / TGA SCRUB: operator on both legal pages (folder client/src/pages, files Privacy.tsx and Terms.tsx) changed from TheGreenAgents.com Ltd to Sweetbyte Ltd, Studio 6, Lower Barn Farm, London Road, Rayleigh SS6 9ET — note these two sentences also name the data controller and the contracting party. Comment references scrubbed from server/_core/oauth.ts and server/_core/worktrackrBridge.ts. Confirmed by exhaustive grep that no email template, PDF renderer, support-bot knowledge file or proposal template asset ever carried the name (the template JPGs and proof-run PDFs matched only on random bytes inside compressed data). (8) STUDIO BRIDGE RETIRED: the inline /admin-bridge endpoint in folder server/_core, file index.ts (~95 lines, HMAC ticket to session cookie for a dedicated bridge admin user) is removed and the mechanism moved to a new generic module, folder server/_core, file adminBridge.ts. Renamed settings ADMIN_BRIDGE_SECRET / ADMIN_BRIDGE_ADMIN_EMAIL, and the route registers ONLY when both are set — with them unset there is no /admin-bridge route at all, rather than the old always-mounted 500. Owner keeps the ability to bridge a different companion app later by setting two variables; the file documents how. Requires on Render: delete STUDIO_BRIDGE_SECRET and STUDIO_BRIDGE_ADMIN_EMAIL, and deactivate the dedicated bridge admin user. crypto / COOKIE_NAME / ONE_YEAR_MS / getSessionCookieOptions imports dropped from _core/index.ts (used only by the retired bridge). Not touched: routers.ts, QuoteWorkspace.tsx, pdfGenerator.ts. No schema change — branded_slots already carries the workspace state. TS: exactly 69, per-file distribution identical to the pre-delivery baseline (diffed). Production build verified. RENDER PROOF (repo root scripts, file delivery-2-9-proof.ts, run with npx tsx): a Sorrells-shaped quote (monthly-only, 20% VAT, 8 short chapters) rendered through the real assembler. Pre-2.9 rules reinstated on a scratch copy reproduced BOTH defects — the 8 short chapters consolidated onto 2 pages, and at 31 monthly lines the totals strip produced an empty page immediately after the pricing table, matching the real contract's page 13 of 18. With 2.9 applied: 8 chapters on 8 pages, and no blank page at any line count from 29 to 34. An excluded chapter is absent from the rendered PDF and the page count drops by exactly one. |
| 3.18 | Sep 14, 2026 | Delivery 2.10 — working hours read from Settings everywhere. Owner reported Settings → Working Hours showing 08:00-16:30 while documents printed something else again; amended to 8:30am-5:30pm Monday to Friday and confirmed BOTH packages use those hours. Root cause, traced across all surfaces: the org's hours (organizations.default_working_hours_start / _end / default_working_days) reached exactly ONE consumer — the quote draft prompt in routers.ts, which wrote them into the quote's site data, which the Standard Quote PDF then printed. The branded proposal engine was never given them (hence Q-207's invented \"Mon-Fri 9am-5pm\" against a service contracted 8:30-5:30, which 2.8's anti-invention rule suppressed rather than corrected because there was nothing true to substitute); the contract clauses had the hours TYPED INTO the seed text, with Gold at 9am-5pm and Silver at 8:30am-5:30pm, so the terms could contradict the narrative inside one signed document; the Word export never mentioned them at all. New single source of truth (folder server/services, file: workingHours.ts): getWorkingHours / formatWorkingHours (\"Monday to Friday, 8:30am-5:30pm\") / formatWorkingHoursLabel (\"8:30am-5:30pm (Monday to Friday)\") / formatTime12h (24h → 12h, minutes dropped when zero). NO FALLBACK by design — the old 08:00-16:30 default is a leftover from the trades origin, and a plausible-but-wrong time on a contract is worse than silence, so unset returns null and each surface omits the sentence; both ends must be present or it is treated as unset. Folder server/engines, file: brandedProposalEngine.ts — new supportHours on QuoteContext, surfaced in the quote facts block as authoritative (\"use these verbatim… never write different hours\") or, when unset, as an explicit instruction to state no hours anywhere; SLA chapter guidance updated to point at it. Folder server/services, file: brandedProposalRouter.ts — gatherQuoteContext now takes the org and fills supportHours; all four call sites pass it. Folder server/services, file: contractDocumentSeeds.ts — the four hardcoded support-hours sentences (clauses 3 and 11 of both Gold and Silver) replaced by a {{supportHours}} placeholder; renderContract fills it from Settings, degrading to \"as agreed\" rather than a wrong time when unset. Folder client/src/components, file: ContractDocumentsTab.tsx — {{supportHours}} added to the placeholder help list. Folder server, file: docxGenerator.ts — new \"Working hours\" section, read from Settings rather than from the AI's site data. Data: repo root, file: migration-support-hours-placeholder.sql — contract documents are seeded once and the org's copy is authoritative, so Sweetbyte's 11 Sep Gold and Silver rows carry the frozen literals and a code change alone would never reach them; this rewrites the two sentences per document to the placeholder, single transaction, idempotent, everything else in every clause untouched. MUST run immediately BEFORE the push — until the code ships, {{supportHours}} is not a known placeholder and would print literally. Folder server, file: pdfGenerator.ts — LOCK BROKEN with explicit owner permission (14 Sep 2026), scoped to the Site Requirements Working Hours row only; EXACTLY THREE existing lines changed (the hasSiteContent guard, the ternary condition, and the value span), plus one import and a new workingHoursLabel const. The row printed sd.workingHours from the quote's site data — whatever the model echoed when it wrote the draft — so one organisation could state different hours on its quote, its proposal and its contract. Settings now wins; the quote's own site data survives only as a fallback for an org that has never set its hours, so nothing is lost for existing quotes. NOTE for a future delivery: SiteQualityTab lets a user type per-quote site hours, which Settings now overrides on the Standard Quote PDF — if a genuine per-quote override is ever wanted (client site access hours, as distinct from the supplier's support hours), it needs its own control rather than this field. The lock remains in force. TS: exactly 69, per-file distribution identical to baseline (diffed). Production build verified. Helper exercised across 08:30 / 17:30 / 09:00 / 12:00 / 00:00 / 13:05 / malformed / empty / unset / half-set. Migration replacement logic simulated against the exact stored clause JSON — placeholder count, JSON re-parse, idempotency and WHERE-clause selectivity all verified — but NOT executed against a live Postgres this session (no instance available), unlike previous migrations. |
| 3.19 | Sep 14, 2026 | Delivery 2.11 — Xero connection (no writes). First stage of the Xero repeating-invoice work: hold a working connection to a Xero organisation and read from it; nothing in this delivery creates or edits anything in Xero. Xero app registered 14 Sep 2026 as a Web app (auth code flow), 0 of 5 connections on the free tier. Render settings added by owner: XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI (https://idoyourquotes.com/api/xero/callback — a setting, not a constant, so staging can differ). SCOPES: the app was created after 2 Mar 2026 so ONLY granular scopes exist for it — the broad accounting.transactions that most guides cite is unavailable. Requested: offline_access, accounting.settings.read, accounting.contacts, accounting.invoices (repeating invoices live under invoices). Deliberately not requested: payments, banktransactions, manualjournals, payroll, reports, files, projects, journals. VERIFIED BY SEARCH, not memory: POST/PUT RepeatingInvoices has been supported since Aug 2022 (the design depended on it); and if TaxType is omitted Xero falls back to the default rate on the account the line is coded to, with contact and item defaults disregarded — since we deliberately send no account code, the tax type MUST be sent explicitly or lines could be raised with no VAT. Schema (dual, both files): new table xero_connections — one row per org (unique index on org_id, which is a correctness guarantee: two rows would mean two sets of rotating refresh tokens and the second write would silently kill the first), holding tenant id/name, encrypted tokens, expiry, granted scopes, the tenant's own sales tax codes and the code matching the org's VAT rate. Folder server/services, file: xeroTokens.ts — AES-256-GCM encryption of tokens at rest (a refresh token is a 60-day key to someone's accounts, and the owner has signed Xero's minimum security requirements), fresh IV per encryption, version-prefixed format, key derived by scrypt from JWT_SECRET; ROTATING JWT_SECRET MAKES EVERY STORED TOKEN UNREADABLE and each org must reconnect — a deliberate trade against a fourth managed secret, and decryption failure degrades to "not connected" rather than throwing. Also HMAC-signed OAuth state (org + user + nonce + 10-minute expiry): without it the public callback would let an attacker attach THEIR Xero organisation to a signed-in user's account and receive that user's invoices. Folder server/services, file: xeroClient.ts — config, authorize URL, code exchange, refresh (Xero rotates the refresh token on every use, so the new pair is persisted before the old is discarded; a rejected refresh DELETES the row rather than leaving Settings claiming a dead connection), tenant lookup, sales-tax-rate read filtered to revenue-side rates only (an expense rate on a sales line is rejected by Xero), tax-type matched on the RATE not the name because names are editable, and a shared xeroFetch for the invoice work. Folder server/services, file: xeroRoutes.ts — Express /api/xero/connect and /api/xero/callback (full-page redirects, so not tRPC), registered in server/_core/index.ts before serveStatic or the SPA would swallow the callback. Folder server/services, file: xeroRouter.ts — tRPC status / refreshRates / disconnect; disconnect is LOCAL (removes IDYQ's tokens, does not revoke at Xero's end) and the panel says so. Folder server, file: db.ts — get/upsert/delete connection helpers; raw tokens never appear outside xeroTokens.ts. Folder client/src/components, file: XeroTab.tsx — new Settings tab: connect, the connected Xero organisation named in full (so "Demo Company (UK)" can never be mistaken for real books), the tenant's sales tax rates listed, re-read, disconnect, and a warning when the org charges VAT but the tenant has no matching sales rate — surfaced in Settings rather than mid-push. Folder client/src/pages, file: Settings.tsx — tab wired in, redirect outcomes surfaced once then stripped from the URL. Folder server, file: routers.ts — xero sub-router mounted ADD-ONLY (one import, one mount, ZERO existing lines changed). Data: repo root, file: migration-xero-connections.sql — creates the table and its unique index, additive, IF NOT EXISTS, idempotent; RUN BEFORE DEPLOY because the Settings page calls xero.status on load. Not touched: QuoteWorkspace.tsx, pdfGenerator.ts, brandedProposal*. TS: exactly 69, per-file distribution identical to baseline (diffed). Production build verified. Proved locally: ciphertext contains no plaintext, round-trips, differs per call (fresh IV), tampered/garbage/foreign-key ciphertext all return null rather than throwing; state verifies, tampered and empty state rejected; tax matching returns OUTPUT2 at 20%, RROUTPUT at 5%, null at 17.5% (absent) and null at 0%; authorize URL encodes the redirect exactly. NOT yet proved: the live handshake against Xero's Demo Company — that is the first test. |
| 3.20 | Sep 14, 2026 | Delivery 2.12 — Xero push. The original goal of the whole sequence: an agreed contract becomes repeating invoices in Xero. Schema (dual): organizations.xero_month_year_suffix (append Xero's "(for [Month] [Year])" placeholders beneath the item name on MONTHLY lines only — owner ruled out a [Year] equivalent for annual lines; off by default because it is a billing convention, not product behaviour), organizations.xero_sales_account_code (optional SINGLE org-level default sales account; NULL = send no account code and let Xero apply its own default, which is the intended behaviour — the owner ruled out per-customer coding since IDYQ cannot know another business's chart of accounts; the field exists only because Xero's docs are NOT explicit about whether a line may omit AccountCode on a draft repeating invoice, so if a push is ever refused for that, setting this once fixes it without a code change), quotes.xero_push (the record of what a quote created — tenant, contact, and the ids of the repeating and one-off invoices; its existence is what stops a re-render double-billing). Data: repo root, file: migration-xero-push.sql — three additive columns, idempotent, RUN BEFORE DEPLOY. Folder server/services, file: xeroInvoicePlan.ts — PURE, no network or database, so the preview screen shows the same objects that are later posted rather than a description of them. Rules: optional lines are excluded on the is_optional FLAG not the pricing type (the live data has no 'optional' pricing_type at all, so filtering on type would have billed every optional line); live pricing types are one_off / monthly / annual and anything unrecognised bills ONCE rather than forever (the safe direction); UnitAmount carries the LIST price with DiscountRate as a percentage so the client sees the concession rather than a quietly reduced rate (only possible because 2.7 stopped baking discounts into rates); LineAmountTypes Exclusive; TaxType ALWAYS explicit, because Xero falls back to the default rate on the account a line is coded to and ignores contact defaults — with no account code sent, an omitted tax type could raise invoices with no VAT; repeating invoices start on the 1st on or after the commencement date, matching contract clause 12, and are due 14 days after the bill date; Status DRAFT throughout so Xero saves each issued invoice as a draft rather than emailing a client. Monthly = Period 1, annual = Period 12 in a SEPARATE template. Guards that block a push outright: any zero-priced or zero-quantity line (named), nothing billable at all, a commencement date that will not parse ("early October"), and a VAT-registered org whose Xero tenant has no matching sales tax rate. Folder server/services, file: xeroClient.ts — contact search (partial match, so "Sorrells" finds "Sorrells Custom Wine Cellars Ltd" rather than creating a near-duplicate; archived contacts flagged not hidden), contact create (free-text address split across Xero's lines, last line treated as a postcode only if it looks like one), revenue-only account list (an expense account on a sales line is rejected by Xero and the user could not diagnose it), repeating invoice create/update/get, invoice create, and an error reader that digs Xero's nested validation messages out so the user sees "Account code must be specified" instead of a 400. Folder server/services, file: xeroRouter.ts — preview (reads only: plan + contact match + what would change) and push, which build the plan from the SAME function with the same inputs, so what the user approved is what is sent; the push saves its record after EVERY created document, so a partial failure is visible rather than repeated; a one-off invoice is never rewritten once created because it may already be approved or paid; a push aimed at a different Xero tenant than the quote's existing record is refused outright. Folder client/src/components, file: XeroPushDialog.tsx — the preview: which Xero organisation, the customer (exact match pre-selected, near matches listed, "create a new customer" with every field pre-filled from the quote and EDITABLE because a typo becomes a permanent record in someone's accounts), every line as Xero will show it, what is deliberately not sent, totals, and on a re-push what would change. Nothing is created until the button at the bottom. Folder client/src/pages, file: BrandedProposalWorkspace.tsx — tick box on the contract dialog, shown only when Xero is actually connected, and the preview opens only AFTER the contract renders successfully. Folder client/src/components, file: XeroTab.tsx — the two push options plus a sales-account list read on demand. TS: exactly 69, per-file distribution identical to baseline (diffed). Production build verified. PROVED against the real signed Sorrells contract (34 assertions, repo root script): 13 monthly lines total £1,370.51 and £274.10 VAT to the penny, list price 20.00 with DiscountRate 11 rather than a baked 17.80, tax type on every line, no account code by default, month placeholder present on monthly and absent on annual and when disabled, optional excluded and listed, zero price blocked, three cadences split into three documents, start date rolls mid-month to the next 1st, unparseable date and missing tax rate both blocked, payload shapes correct (ACCREC/DRAFT/Exclusive/Period 1 vs 12/14 days), and the comparison spots added, removed and changed lines while leaving 11 untouched. NOT yet proved: any live call against Xero — that is the first test, and the owner has chosen to work against Sweetbyte's real books rather than the Demo Company. |
| 3.21 | Sep 16, 2026 | Delivery 2.12a — two fixes found on the FIRST real preview of Sorrells (Q-1789392897217), both caught before anything reached Xero, which is what the preview-then-confirm design exists for. (1) ORDINAL DATES REJECTED: the contract dialog tells the user the start date is "printed exactly as you type it", so the owner typed "1st October 2026" — and JavaScript's Date rejects an ordinal suffix outright, so the push was blocked as if the date were nonsense. New parseHumanDate in folder server/services, file xeroInvoicePlan.ts: strips st/nd/rd/th, and handles "1 October 2026", "October 1 2026", ISO yyyy-mm-dd (parsed as LOCAL, so a timezone west of London cannot roll it back a day) and UK numeric 01/10/2026 read DAY FIRST, because a UK user typing that means October and JavaScript would read January. Genuine nonsense ("early October", "32/13/2026", empty) still blocks. (2) ITEM NAME PRINTED TWICE ON EVERY INVOICE LINE: stored descriptions repeat the item name before their detail ("Silver IT Support — Unlimited Remote — Silver IT Support for 22 workstations..."), and the duplicate check only caught an EXACT match, so the preview showed the name, the month placeholder, then the name again. New stripLeadingName removes a leading copy of the item name plus its separator (dash, colon, bullet), case-insensitively; requires a separator to follow so item name "Backup" cannot swallow the start of "Backup Device Pro". Same file. TS: exactly 69, per-file distribution identical to baseline (diffed). Production build verified. The 34-assertion Sorrells proof still passes unchanged, plus 17 new assertions across the date formats and the deduplication. SEPARATELY NOTED, owner's data not code: line item descriptions in the catalogue still say "Mon-Fri 9-5" — delivery 2.10 routed the AI prose and the contract clauses through Settings but line item descriptions are stored text, and these ones go onto a client's invoice every month. |
| 3.22 | Sep 16, 2026 | Delivery 2.12b — two facts learned from Xero itself on the first real push attempt, both of which contradicted the documented design. (1) ACCOUNT CODE IS REQUIRED. Xero answered "Account code or ID must be specified". The agreed design was to send NO account code and let Xero apply the organisation's default, because IDYQ cannot know another business's chart of accounts; Xero's own documentation does not state that a line must carry one, and the third-party wrappers contradicted each other, which is why 2.12 shipped the optional org-level default as a hedge. That hedge is now the required path. buildPushPlan blocks with an instruction ("Set a default sales account on the Xero tab in Settings, e.g. 200 Sales") rather than letting the user meet a validation error from an API they have never seen. Still ONE org-level default, never per-customer coding. (2) LINEAMOUNT MUST BE SENT WHENEVER THERE IS A DISCOUNT. Xero answered "The line total 440.00 does not match the expected line total 391.60" — 22 x GBP 20.00 against the discounted figure. Omitting LineAmount does not make Xero compute it from the discount: it fills in Quantity x UnitAmount, then validates that against its own discount formula and rejects its own number. LineAmount is now always sent as round2(Quantity x UnitAmount x (100 - DiscountRate) / 100), rounded to pennies before sending because Xero compares against its own calculation and an unrounded float fails over a fraction of a penny. Group subtotals now SUM the LineAmounts actually being sent rather than recomputing in parallel, so the preview total and the Xero total cannot drift. Folder server/services, file: xeroInvoicePlan.ts only — no schema change, no SQL, no other file touched. TS: exactly 69, per-file distribution identical to baseline (diffed). Production build verified. Proof script (repo root scripts, delivery-2-12-plan-proof.ts) updated and extended: the obsolete "no account code by default" assertion replaced by "configured code reaches every line" plus "no code invented when unset", and new checks that every line's LineAmount satisfies Xero's formula, that the first Sorrells line is 391.60 (the exact figure Xero rejected), that line 2 is 40.05 and line 3 is 245.64, and that a missing account code blocks before Xero sees it. Sorrells subtotal still GBP 1,370.51 and VAT GBP 274.10. ALSO NOTED, owner's data not code: editing a CATALOGUE description does not change a quote that already exists — line items are copied onto the quote at creation and the copy is authoritative, so a catalogue fix applies from the next quote onwards and an existing quote must be edited directly. |
| 3.23 | Sep 16, 2026 | Delivery 2.13 — profit split by cadence, ex-VAT alignment, blank buy-in, document date. Driven by the quotes list showing one profit figure for a quote with both a project fee and a support contract. (1) SPLIT PROFIT AND MARGIN: the Total column has always split one-off from recurring (built on the dashboard from three stored figures), but Profit came from a single SQL aggregate summing every line in one pass with no cadence grouping, so quote 210 printed GBP 873.35 — a one-time GBP 698.00 and a recurring GBP 175.35/mo added into a number that is neither, with a blended 93.2% margin to match. The quote workspace has always shown these separately in its green header pill; the list now does the same. Folder `server`, file: db.ts — `getQuotesWithProfit` gains per-cadence cost and profit aggregates plus a line count, in the same single grouped query (no extra round trip, no schema change). Bucketing: 'monthly' and 'annual' matched exactly, EVERYTHING ELSE falls into one-off including NULL and the legacy 'standard', mirroring the workspace's own else-branch and the Xero plan builder's safe direction. `IS DISTINCT FROM` rather than `<>` because pricing_type is nullable and `NULL <> 'monthly'` is NULL, which would have silently dropped every legacy line. Folder `client/src/pages`, file: Dashboard.tsx — Profit and Margin take the same stacked shape as the Total column beside them. (2) EX-VAT ALIGNMENT: `quotes.total` is subtotal + tax and was the only VAT-inclusive number on a list row, while monthlyTotal, annualTotal and every profit and cost figure are ex VAT — so quote 210 read GBP 837.60 on the list while its own workspace header read 'GBP 698.00 + GBP 238.62/mo · Ex VAT' for the same quote (837.60 being 698.00 x 1.2), and the margin only reconciled if you divided by 1.2 first. The list now reads `subtotal`. Nothing stored changes and no other consumer is affected. (3) BLANK BUY-IN COUNTS AS ZERO (owner's decision): the dashboard aggregate has always COALESCEd a null cost to zero, while the workspace SKIPPED such lines as not-yet-priced — so the same quote could report two different profit figures depending on the screen. Folder `client/src/pages`, file: QuoteWorkspace.tsx — LOCK BROKEN with explicit owner permission (16 Sep 2026); ELEVEN existing lines of code changed in two places (the header pill's four-line `hasCost` test plus its `costRaw` declaration and `if (hasCost)` gate, six lines; and the per-row PROFIT cell's four-line `hasCost` test plus its guard, five lines), with sixteen comment lines rewritten alongside them. The dash now appears only on a row with no quantity. Optional lines remain counted in profit, as they always were in these aggregates — owner's decision, on the basis that an optional line can simply be removed from the quote if it is not taken. Note this means profit can include work the stored totals exclude, since recalculateQuoteTotals drops is_optional rows; the margin stays internally consistent because its revenue base (profit + cost) includes them too. (4) Folder `client/src/pages`, file: BrandedProposalWorkspace.tsx — the toolbar date control relabelled 'Document date'. As plain 'Date' it read as a duplicate of the contract dialog's 'Start date', which is a different fact entirely: one is when the document is dated (title page, blank means today, introduced in 2.8 because re-rendering a contract agreed on 22 August restamped it), the other is when the service commences (acceptance page, clause placeholders, and since 2.12 the date Xero starts raising the repeating invoice from). Owner confirmed the start date should continue to be typed per contract rather than persisted. TS: exactly 69, per-file distribution byte-identical to baseline (diffed). Production build verified. PROVED by running rather than reasoning: the SQL half against a real Postgres engine (pglite) with quote 210 reconstructed from its live figures — 28 assertions, all passing, reproducing one-off GBP 698.00, monthly GBP 175.35, the old combined GBP 873.35 and the old blended 93.2% exactly, plus blank-buy-in, legacy pricing types, an 11% discounted line at GBP 391.60 / GBP 215.60, three cadences splitting into three figures that still sum to the old total, and a quote with no lines returning zeros rather than NULLs. The client half has its own 15 assertions including the workspace header pill for quote 210 rendering byte-identically to its pre-delivery screenshot. Proof script: folder `scripts`, file: delivery-2-13-proof.ts. |
| 3.24 | Sep 16, 2026 | Delivery 2.14 Chunks 1 and 2 — sector vocabulary and chapter identity. First two chunks of the Sector Completeness Programme (see Future Roadmap). Both are foundations: Chunk 1 recovers work already paid for, Chunk 2 is a pure refactor whose only purpose is to make sector-specific chapter sets safe. CHUNK 1 — SECTOR VOCABULARY. New file, folder `shared`, file: sectors.ts — the single definition of what a sector is called in each subsystem. Canonical keys are underscored (`commercial_cleaning`, as stored on users.default_trade_sector and quotes.trade_preset and as used by the trade preset, catalogue seed and demo quote registries); template library folders are hyphenated (`commercial-cleaning`) and are derived, never stored. Fixes two independent faults. (a) `tradePresetToSector()` in folder `server/services`, file: templateLibrary.ts matched on hyphenated ids while every stored value is underscored, so all 25 trade presets returned null and fell through to the IT Services default — eighteen finished proposal designs (three sectors x six styles), thumbnails and all, were unreachable from the sector default. A second hand-written copy of the same function inside folder `client/src/components`, file: BrandedTemplatePickerV2.tsx DID normalise underscores, so the picker worked for three sectors and the server default for none; two copies of one function, each broken differently, which is why neither was noticed. Both replaced by the shared resolver. (b) Folder `server`, file: tradePresets.ts — `website_marketing` was offered at signup with no preset at all (26 sector options, 25 presets) and also failed the picker because its key normalises to `website-marketing` while its folder is `web-marketing`. Preset added, shaped like the IT Services one because the businesses are shaped alike (recurring retainers plus one-off project work): technical review checklist covering content-supply responsibility, domain and DNS ownership, redirect plans, revision rounds and asset ownership; line-item guidance that separates one-off from monthly from annual and insists ad spend is a pass-through line and never folded into a management fee; timeline guidance naming client content supply as the schedule risk and forbidding any promised ranking, traffic figure or conversion rate. Sector display names also centralised, using the existing strings verbatim so nothing visible changes. CHUNK 2 — CHAPTER IDENTITY. New file, folder `shared`, file: proposalChapters.ts. A proposal chapter was identified by its POSITION: the pricing chapter, which the assembler treats specially because it draws a real table from the line items instead of rendering AI prose, was 'the chapter at index 16'. That number was written out in four places — the engine that declared it, the assembler and the proposal router that imported it, and the workspace that hand-copied it, with a comment recording that it had already drifted once when E.4.3 inserted a chapter (live consequence at the time: the pricing chapter was deletable). Chapters now carry a stable `chapterId` and an optional `role`; `isPricingChapter()` is shared by all four consumers and the magic number is gone from every one of them. Identity travels through the slot plan, both the embed and generate paths, and into the saved state — and into ChapterSlotSchema in folder `server/services`, file: brandedProposalRouter.ts, for the same reason `excluded` had to be added in 2.9: z.object strips unknown keys, so without it a chapter's identity would be dropped the first time the workspace saved. BACK COMPATIBILITY: proposals saved before this delivery carry no identity — every proposal already issued, the live Sorrells one included — and fall back to the legacy index, scoped to the original IT set. A DEFECT IN THAT SHIM WAS FOUND BY THIS DELIVERY'S OWN PROOF: the first version fell back whenever the ROLE was absent, which looked equivalent and was not — a roleless chapter in a new sector set that happened to land at position 16 would have been treated as pricing and had its body replaced by a pricing table, reintroducing precisely the failure the chunk exists to prevent. The test is now whether the chapter carries identity at all: a chapter with a `chapterId` came from a set that assigns roles, so its role — including having none — is authoritative and its position irrelevant. `SLOT_DEFS` and `SlotDef` exported so Chunk 3 can lift the IT set into the sector pack registry. `PRICING_SLOT_INDEX` retained as a deprecated re-export so nothing breaks. TS: exactly 69, per-file distribution byte-identical to baseline (diffed after each chunk separately). Production build verified. PROOFS, both runnable: folder `scripts`, file: delivery-2-14-chunk1-proof.ts (42 assertions) asserts every go-to-market sector reaches its own designs, that the server's own resolver agrees, that historical spellings still resolve (hyphen, underscore, shorthand, mixed case, whitespace), that sectors without designs fall back deliberately, that all four design folders exist on disk with six styles each, that the four registries agree, and that no signup option lacks a preset. Folder `scripts`, file: delivery-2-14-chunk2-proof.ts (25 assertions) asserts legacy proposals resolve unchanged, that role beats position at indices 2, 9 and 16, that a roleless chapter at 16 is NOT pricing, that the IT set is still 19 chapters in order with exactly one role, and — standing in for a before/after PDF diff and stronger than one — that the assembler's dispatch decision is identical to the old `slotIndex === 16` logic for all 19 chapters in both the legacy and modern saved shapes, 38 comparisons, zero changes. NOT TOUCHED: routers.ts, QuoteWorkspace.tsx, pdfGenerator.ts. No schema change, no SQL, no migration, no new dependency. |
| 3.25 | Sep 17, 2026 | Delivery 2.14 Chunk 3 — sector pack registry. Third chunk of the Sector Completeness Programme, and the last of the three foundations before sector chapter sets become possible. A deliberate no-op: no behaviour changes, no schema change, no SQL, no locked file touched. PROBLEM: 'what does IDYQ have for Commercial Cleaning?' could not be answered from one place. A sector's artefacts were spread across five registries in five files — tradePresets.ts, catalogSeeds/index.ts, demoQuotes/index.ts, the templates library tree, and the chapter list inside the proposal engine — which until Chunk 1 did not agree on how to spell a sector's name. That sprawl is how a broken preset-to-design mapping hid for months and how `website_marketing` came to be offered at signup with no trade preset: nothing put the gaps side by side. NEW FILE, folder `server`, file: sectorPacks.ts — one `SectorPack` per sector carrying key, display name, go-to-market flag, trade preset presence, catalogue seed, demo quote factory, template sector, `chapterSetId`, and contract starting point. DERIVED from the registries that own each artefact rather than hand-written, so a pack can never disagree with its source; the proof asserts exactly that across all 26 sectors and 6 artefact checks each, with zero drift. Deliberately sits ON TOP of the existing registries rather than replacing them — inverting the dependency would have meant rewriting four working files for no gain and a real risk of import cycles (the demo factories already import their types from their own index). Also exposes `sectorCompleteness()`, returning the six code-checkable artefacts of the seven that define a finished sector, with a score and a list of what is outstanding; the seventh (one real quote taken end to end through Xero by the owner) is not observable from code and is not guessed at. All four go-to-market sectors currently score 4/6, outstanding: a chapter set of their own, and a contract starting point — Chunks 5, 7 and 8. Folder `server/engines`, file: brandedProposalEngine.ts — new `CHAPTER_SETS` registry, `getChapterSet(id)` and `listChapterSetIds()`, add-only. The pack names a chapter set by ID rather than importing the array, because importing the proposal engine constructs an OpenAI client at module load and coupling registration and catalogue seeding to an AI client they never use would be a real cost for no benefit. `getChapterSet` falls back to the original set for an unknown id rather than throwing: an id reaches it only from a pack or from a proposal's saved state, and a proposal already sent to a client must keep rendering even if its set is later renamed. THE IT CHAPTER SET WAS LIFTED VERBATIM — owner's decision, 17 Sep 2026, taken after seeing a live proposal in which two of the four IT-specific chapters spent a page each explaining why they were not relevant. Lifting unchanged keeps this chunk verifiable (anything that looks different afterwards is a fault); the tidying goes in Chunk 5 alongside the other sectors' sets and the content fixes. CORRECTION to the coverage table published in the Sector Completeness Programme on 16 Sep: starter catalogue counts for three sectors were each one too low — the figures were taken from a grep that included a type declaration line. True counts are IT 88, Website & Marketing 44, Commercial Cleaning 26, Pest Control 24. Table amended. TS: exactly 69, per-file distribution byte-identical to baseline (diffed). Production build verified. PROOF, folder `scripts`, file: delivery-2-14-chunk3-proof.ts — 32 assertions: one pack per sector with historical spellings resolving, zero drift between packs and their source registries across all 26 sectors, the four go-to-market scores and catalogue depths, a sector with almost no artefacts (plumbing, 1/6) reporting honestly rather than flatteringly, every sector still pointing at the same chapter set, the set resolving to the SAME ARRAY OBJECT the generation code reads rather than a copy that could drift, the nineteen chapters unchanged in id and order, unknown and null ids falling back rather than throwing, and — the no-op claim stated as an assertion — zero sectors resolving to a different chapter list than before. Chunks 1 and 2 proofs re-run and still passing. |
| 3.26 | Sep 17, 2026 | Delivery 2.14 Chunk 4 — chapter set stamping. Last of the three foundations; Chunk 5 (sector chapter sets) is now safe to build. No schema change, no SQL, no migration, no locked file touched. THE FAULT THIS PREVENTS: `regenerateSingleChapter` looked its chapter up as `SLOT_DEFS.find(d => d.slotIndex === slotIndex)` and threw when it missed. With one chapter set that was safe. Once sectors have sets of their own, a position number means nothing across sets — regenerating chapter 9 of a Commercial Cleaning proposal would have found IT's 'Cloud Migration Approach' and rewritten the chapter as a cloud migration plan, or thrown outright on a shorter set, on documents already sent to clients. Folder `shared`, file: schema.ts — `BrandedSlotsState` gains an optional `chapterSetId`. NO SCHEMA CHANGE AND NO SQL: the field lives inside the existing `branded_slots` json blob, and `drizzle/schema.ts` re-exports the type rather than redeclaring it, so the dual-schema rule holds with no second edit. ABSENCE IS THE SIGNAL and is never back-filled — every proposal saved before this delivery, the live Sorrells one included, carries no stamp and is read as the frozen legacy IT set. Back-filling would stamp an old proposal with a set it was never built from, which from Chunk 5 would mean regenerating one of its chapters against the wrong guidance. Folder `shared`, file: proposalChapters.ts — `LEGACY_CHAPTER_SET_ID` (frozen: a revised IT set is a NEW id, never an edit to this one) and `chapterSetIdOf()`. Folder `server/engines`, file: brandedProposalEngine.ts — `BrandedProposalDraft` carries the stamp so the generator states which set it used rather than leaving the workspace to assume; `regenerateSingleChapter` takes an optional `chapterSetId` and resolves within `getChapterSet(id)`, preferring the chapter's own `chapterId` over its position, with the position fallback reserved for pre-Chunk-2 chapters that carry no id — which are legacy-set proposals by definition, so matching them by position within the legacy set is correct. Folder `server/services`, file: brandedProposalRouter.ts — `saveSlots` and `regenerateChapter` both accept the stamp; optional on the wire so a browser tab loaded before this delivery can still save, and such a save writes no stamp, which reads as the legacy set, which is what that tab's chapters actually came from. Folder `client/src/pages`, file: BrandedProposalWorkspace.tsx — the stamp is held in state, restored from the saved state, set by a fresh draft, and sent on every save and every regenerate; deliberately NOT defaulted to the current set when absent. TS: exactly 69, per-file distribution byte-identical to baseline (diffed). Production build verified. PROOF, folder `scripts`, file: delivery-2-14-chunk4-proof.ts — 27 assertions. Proving this by hand is impossible while only one set exists, so the proof REGISTERS A SECOND SET AT RUNTIME — eleven chapters instead of nineteen, pricing at position 9 instead of 16, cleaning-shaped chapter names — and exercises the real resolution against it: each id resolves to its own set; all 19 legacy chapters resolve identically to the pre-Chunk-4 code (zero differences); a cleaning proposal's chapter 9 resolves to its Pricing Summary while the old code would have returned Cloud Migration Approach, and its chapter 11 to Call to Action where the old code would have returned Disaster Recovery; identity beats position when the two disagree; a chapter absent from a set resolves to nothing rather than to the wrong one; and `isPricingChapter` gives two different, both-correct answers for position 9 across the two sets. The simulated set is removed at the end and the registry asserted back to one. Chunks 1, 2 and 3 proofs re-run and still passing. |
| 3.27 | Sep 17, 2026 | Delivery 2.14 Chunk 4a — markdown in chapter bodies. Found immediately after 4 shipped: a regenerated 'Cybersecurity & Compliance' chapter on the live Sorrells proposal came back as a markdown table and printed its pipe characters, `--- | ---` separator row and `**` emphasis markers literally to the reader. NOT caused by Chunk 4 — the chapter lookup resolves identically for that proposal — but latent since single-chapter regeneration was built, and only ever visible on a regenerate. TWO INDEPENDENT CAUSES, both in folder `server/engines`, file: brandedProposalEngine.ts. (1) THE REGENERATE PROMPT NEVER CARRIED THE FORMATTING RULE. The full-draft prompt ends with 'The body should be plain text with double-newlines between paragraphs. No HTML, no markdown, no headings inside body.' The single-chapter regenerate prompt's system message had no equivalent line at all, so the draft path was told to stay plain and did, while the regenerate path was told nothing. The rule is now on both, and the regenerate copy is explicit about tables specifically — no pipe characters, no asterisks for emphasis, no separator rows — and states the consequence ('any markup you write is printed literally to the client') rather than just prohibiting it. (2) THAT CHAPTER'S GUIDANCE ASKED FOR A TABLE: it ended 'Brief table-of-controls format works well here', requesting a layout the renderer cannot draw. Chapter bodies are plain text; there is no table support for them. The two-column control mapping is genuinely the right way to present this material, so the content is kept and only the layout changed — one control per line as 'Control area — how it is delivered under this agreement' — with an explicit prohibition on markup. An exhaustive sweep of all 19 chapters' guidance strings found this was the only one requesting unsupported markup; Title Page and Pricing Summary mention markdown and tables only to forbid them. OPEN QUESTION for Chunk 5: whether chapter bodies should gain real table support rather than banning tables, since several chapters would read better as two-column mappings. TS: exactly 69, per-file distribution byte-identical to baseline (diffed). Production build verified. PROOF, folder `scripts`, file: delivery-2-14-chunk4a-proof.ts — 12 assertions read the REAL prompt strings from source rather than a copy, so they fail if either rule is later edited away: both prompts carry a plain-text rule, the regenerate prompt forbids tables and says why, no chapter invites unsupported markup, and the offending chapter now forbids what it used to request while keeping its control-area content. The 'no chapter invites markup' assertion had to distinguish an invitation from a prohibition — its first version flagged the new 'Do NOT use a markdown table' wording as an offender — so negated sentences are dropped before matching. Chunks 1 to 4 proofs re-run and still passing. NOTE for the owner: the Sorrells chapter is saved in its broken state, since chapter bodies are stored text; regenerating it once after this deploy returns it clean, or the markup can be edited out by hand. |
| 3.28 | Sep 17, 2026 | Delivery 2.14 Chunk 4b — real tables in chapter bodies. Chunk 4a resolved the live Sorrells fault by BANNING tables; this draws them instead, on the owner's decision that table support makes the product materially better for customers. A control area beside how it is delivered genuinely is a table, and so are a cleaning frequency schedule and a pest treatment programme, so Chunk 5's new sets should be written knowing tables are available. Three owner decisions, 17 Sep 2026: raw pipe markup when editing (a cell editor is logged as a future improvement, not built); named chapters only; cap the width rather than shrink the type. NEW FILE, folder `shared`, file: chapterTables.ts — the parser, SHARED by the PDF assembler and the workspace preview so the two cannot disagree about what a table is; a chapter that looks like a table on screen and prints as pipes in the document would be worse than no support at all. Syntax is markdown pipe tables, chosen because it is what the model already produced unprompted, so guidance can say 'you may use a table' rather than teach an invented format. Leading/trailing pipes optional, alignment colons tolerated, ragged rows padded or trimmed to the header rather than guessed at, and `**` emphasis markers STRIPPED rather than rendered — printing those literally was the original fault. A body with no table produces exactly the paragraphs the old splitting produced. Folder `server/services`, file: brandedProposalAssembler.ts — drawChapter now walks blocks rather than paragraphs; new layoutTable / drawTableBlock generalise what drawPricingChapter has always done for line items (the pricing table keeps its own bespoke implementation, its columns being fixed by the quote's shape rather than by text). Column widths are proportional to measured content and then clamped to 15–55% of the available width, so a column of short labels beside a column of sentences cannot collapse to a few characters. A page break inside a table REPEATS THE HEADER, and a header is never left as the last thing on a page. drawChapter exported so the proof can render real pages. Folder `client/src/pages`, file: BrandedProposalWorkspace.tsx — new ChapterBody component renders the same blocks on screen; the read view shows a real table, editing remains the raw markup. Folder `server/engines`, file: brandedProposalEngine.ts — new TABLE_GUIDANCE appended to the guidance of the chapters permitted to use one: Cybersecurity & Compliance (control mapping) and Service Level Agreement (priority-to-target mapping). CRITICALLY, THE BLANKET BANS IN BOTH PROMPTS BECAME CONDITIONAL — 'tables only where this chapter's guidance permits one' — because a prompt saying 'no tables' while a chapter's guidance says 'you may use a table' is a contradiction the model resolves either way. THE FOUR-COLUMN CAP is stated to the model AND enforced by the parser: a wider table falls back to one row per line, silently, because a proposal that quietly changes type size mid-chapter looks broken in a way that is harder to explain. FAULT CAUGHT BY THE PROOFS DURING THIS CHUNK: adding the TABLE_GUIDANCE constant above SLOT_DEFS split the `export const SLOT_DEFS` declaration, leaving `export` attached to the new constant and SLOT_DEFS unexported. TypeScript compiled clean (both forms are valid) and the baseline held at 69, but Chunk 2's proof silently SKIPPED its chapter-set block, Chunk 3 failed 4 assertions and Chunk 4 crashed. Restored. This is the argument for re-running every earlier proof on every delivery rather than only the current one. TS: exactly 69, per-file distribution byte-identical to baseline (diffed). Production build verified. PROOF, folder `scripts`, file: delivery-2-14-chunk4b-proof.ts — 35 assertions. The parser is asserted against the EXACT body the model produced on the live Sorrells proposal, emphasis markers and all: three blocks, two columns, three rows, no asterisk or pipe surviving anywhere. Bodies without tables verified unchanged, including that a stray pipe in prose and a header with no rows are both correctly NOT tables. The PDF half is proved by rendering real pages with pdf-lib and reading back the page count rather than reasoning about geometry: a 45-row table spans more than one page, pages returned match pages added, and the real Sorrells chapter fits on one. delivery-2-14-chunk4a-proof.ts updated for the conditional rule — its assertion changed from 'no chapter invites a table' to 'no chapter invites one without carrying the permission text', plus new assertions that exactly two named chapters are permitted and that each states the cap. All six proofs in the 2.14 series pass. OWNER NOTE: the broken Sorrells chapter now RENDERS AS A TABLE without needing regeneration — the stored markup was valid all along, only the renderer was missing. FUTURE IMPROVEMENT, logged not built: a cell-based table editor, so editing a table does not mean editing raw pipes. |
| 3.29 | Sep 17, 2026 | Delivery 2.14 Chunk 4c — no invented start dates. Taken separately from the rest of the content faults at the owner's direction because it is the only one that could cost an argument with a client: a contract's Executive Summary said service started 1 September while its own Acceptance page said 1 October. ROOT CAUSE: the model is never given the commencement date. QuoteContext has no date field of any kind; the date is typed by the supplier in the contract dialog long after the chapters are written, and reaches only the acceptance page and the clause placeholders. So any date in chapter prose is invented — the same class of fault as the fabricated 9am-5pm support hours that 2.10 corrected, and handled the same way: silence beats a plausible wrong value. Folder `server/engines`, file: brandedProposalEngine.ts — a fifth clause added to AUTHORITY_HIERARCHY_RULES forbidding any commencement date, start date, go-live date or first-invoice month, naming the specific phrasings to avoid ("from 1 September", "commencing in October"), explaining WHY the model cannot know it, and supplying dateless alternatives ("from the agreed commencement date", "once the agreement begins") so a sentence that needs the timing can still be written. Placed in the SHARED rules rather than in one chapter's guidance because the fault surfaced in an Executive Summary but any chapter could produce it, and because both the full-draft and the single-chapter regenerate prompts interpolate that block — the lesson from 4a, where a rule living in only one prompt meant the fault appeared only on a regenerate. buildQuoteFactsBlock exported for the proof. TS: exactly 69, per-file distribution byte-identical to baseline (diffed). Production build verified. PROOF, folder `scripts`, file: delivery-2-14-chunk4c-proof.ts — 8 assertions reading the real prompt source: the rule exists, names the forms it must not use, explains why, and offers an alternative; both prompt paths interpolate the shared rules and the rule sits inside that block; and — the assertion that matters for the future — the quote facts block still contains no commencement date, so if a date is ever added to the engine's inputs this test fails rather than leaving a rule that silently contradicts the facts it is given. All seven proofs in the 2.14 series pass. REMAINING CONTENT FAULTS FOLDED INTO CHUNK 5: Key Personnel narrating that the brochure names nobody, chapters explaining their own irrelevance, and the raw quote reference in prose. SEPARATELY, A CORRECTION: 'Proposal for Jessy' on a live proposal was NOT a prompt fault. The quote's clientName field contained the contact's first name, and the model was correctly instructed to use the client name from the quote. A data-entry issue, removed from the chapter-set work; a workspace nudge is the right place for it if it recurs. |

---

*This document serves as the single source of truth for IdoYourQuotes development. Update this document when significant features are added or architecture changes.*
