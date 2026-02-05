# IdoYourQuotes - Complete Product Blueprint

**Version:** 2.0  
**Last Updated:** February 5, 2026  
**Status:** MVP Complete, Multi-Tenancy Complete, Production Live

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

### Future Phases

| Phase | Features |
|-------|----------|
| **Quote History Intelligence** | Upload historical quotes, pattern extraction, reference-based suggestions |
| **Pricing Tiers** | Solo £29/mo, Team £59/mo, Pro £119/mo with AI credits |
| **Stripe Integration** | Subscription billing, overage charges |
| **White-Label** | Partner mode, API access, "Powered by IdoYourQuotes" |
| **Duplicate Quote** | Copy existing quote as starting point |

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

---

*This document serves as the single source of truth for IdoYourQuotes development. Update this document when significant features are added or architecture changes.*
