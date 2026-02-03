# IdoYourQuotes - Project TODO

## Brand & Design
- [x] Set up professional color palette (bold primary, neutral dark, light background)
- [x] Configure typography (legible sans-serif, modern but professional)
- [x] Apply theme to index.css with OKLCH colors

## Landing Page
- [x] Hero section with clear value proposition ("We do your quotes")
- [x] Feature highlights section
- [x] How it works section (4-step pipeline visual)
- [x] Trust signals / testimonials section
- [x] CTA and pricing section
- [x] Footer with links

## Authentication
- [x] Login/logout flow using Manus OAuth
- [x] Protected routes for authenticated users
- [x] User profile display in dashboard

## Database Schema
- [x] Quotes table (id, userId, status, clientName, clientEmail, reference, terms, createdAt, updatedAt)
- [x] Quote line items table (id, quoteId, description, quantity, unit, rate, total)
- [x] Tender contexts table (id, quoteId, symbolMappings, assumptions, locked fields)
- [x] Internal estimates table (id, quoteId, notes, riskNotes, assumptions, aiSuggestions)
- [x] Inputs table (id, quoteId, type, content, filename, uploadedAt)
- [x] Product catalog table (id, userId, name, description, unit, defaultRate)

## Quote Workspace (Core Feature)
- [x] Quote list view with status filters (draft, sent, accepted)
- [x] Create new quote flow
- [x] 4-tab workspace layout:
  - [x] Inputs tab (upload PDFs, images, audio, text)
  - [x] Interpretation tab (tender context, symbol mapping)
  - [x] Internal Estimate tab (private notes, costs, risks)
  - [x] Quote tab (client-facing output)
- [x] Line items CRUD (add, edit, delete, reorder)
- [x] Quote totals calculation
- [ ] Quote status management (draft → sent → accepted)

## PDF Generation
- [ ] Generate professional PDF quote
- [ ] Download PDF functionality
- [ ] Email quote option (future)

## Product/Service Catalog
- [x] Catalog list view
- [x] Add/edit/delete catalog items
- [ ] Import catalog items into quote line items

## Settings
- [x] User profile settings
- [x] Default terms and conditions
- [x] Company details for quotes

## AI Features (Future - API Integration)
- [ ] AI-assisted draft suggestions
- [ ] Estimator prompt system
- [ ] Audio transcription for meeting notes
- [ ] Document parsing for tenders

## Testing
- [ ] Write vitest tests for quote CRUD operations
- [ ] Write vitest tests for line item calculations

## Deployment
- [ ] Push to GitHub
- [ ] Configure for Render deployment

## Testing
- [x] Unit tests for quote CRUD
- [x] Unit tests for line items
- [x] Unit tests for catalog

## Deployment
- [ ] Push to GitHub
- [ ] Configure for Render deployment

## PostgreSQL Migration
- [x] Convert schema from MySQL to PostgreSQL
- [x] Update drizzle config for PostgreSQL
- [x] Update db.ts connection for PostgreSQL
- [x] Test database operations
- [ ] Push to GitHub

## Production Deployment Fixes
- [x] Remove old MySQL migration files causing conflicts
- [x] Generate fresh PostgreSQL migrations
- [x] Implement standalone authentication (remove Manus OAuth dependency)
- [x] Add password hashing with bcrypt
- [x] Create login/register pages
- [ ] Push to GitHub and verify deployment
