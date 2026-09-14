-- ═══════════════════════════════════════════════════════════════════
--  IdoYourQuotes — schema & migration audit
--  Generated 14 Sep 2026 from shared/schema.ts (17 tables, 343 columns)
--
--  READ ONLY. Every statement below is a SELECT. Nothing is written,
--  altered or deleted, so it is safe to run on production at any time
--  and safe to re-run.
--
--  Run in the Render shell:
--     echo go; psql $DATABASE_URL -f audit-schema.sql
--  or paste the whole file into an open psql session.
--
--  READING THE OUTPUT: every section is built to return ZERO ROWS when
--  everything is correct, except sections 8 and 9 which are summaries.
--  Any row returned by sections 1-7 is something to look at.
-- ═══════════════════════════════════════════════════════════════════

\echo ''
\echo '=== 1. MISSING COLUMNS (expected by the code, absent in the database) ==='
\echo '    Zero rows = the database matches shared/schema.ts.'
\echo '    Any row here means a migration never ran, and the feature that'
\echo '    needs that column will fail at runtime.'

WITH expected(table_name, column_name) AS (VALUES
  ('catalog_items','category'),
  ('catalog_items','cost_price'),
  ('catalog_items','created_at'),
  ('catalog_items','default_rate'),
  ('catalog_items','description'),
  ('catalog_items','id'),
  ('catalog_items','is_active'),
  ('catalog_items','name'),
  ('catalog_items','org_id'),
  ('catalog_items','pricing_type'),
  ('catalog_items','unit'),
  ('catalog_items','updated_at'),
  ('catalog_items','user_id'),
  ('containment_takeoffs','cable_summary'),
  ('containment_takeoffs','created_at'),
  ('containment_takeoffs','detected_scale'),
  ('containment_takeoffs','drawing_notes'),
  ('containment_takeoffs','drawing_ref'),
  ('containment_takeoffs','fitting_summary'),
  ('containment_takeoffs','id'),
  ('containment_takeoffs','input_id'),
  ('containment_takeoffs','markup_image_url'),
  ('containment_takeoffs','page_height'),
  ('containment_takeoffs','page_width'),
  ('containment_takeoffs','paper_size'),
  ('containment_takeoffs','questions'),
  ('containment_takeoffs','quote_id'),
  ('containment_takeoffs','raw_segments_json'),
  ('containment_takeoffs','revision'),
  ('containment_takeoffs','segment_assignments_json'),
  ('containment_takeoffs','status'),
  ('containment_takeoffs','svg_overlay'),
  ('containment_takeoffs','tray_runs'),
  ('containment_takeoffs','updated_at'),
  ('containment_takeoffs','user_answers'),
  ('containment_takeoffs','user_inputs'),
  ('containment_takeoffs','verified_at'),
  ('containment_takeoffs','verified_by'),
  ('contract_documents','acceptance_body'),
  ('contract_documents','clauses'),
  ('contract_documents','created_at'),
  ('contract_documents','display_name'),
  ('contract_documents','id'),
  ('contract_documents','is_active'),
  ('contract_documents','next_steps_body'),
  ('contract_documents','org_id'),
  ('contract_documents','pricing_caveat_body'),
  ('contract_documents','thank_you_body'),
  ('contract_documents','tier'),
  ('contract_documents','updated_at'),
  ('electrical_takeoffs','counts'),
  ('electrical_takeoffs','created_at'),
  ('electrical_takeoffs','db_circuits'),
  ('electrical_takeoffs','drawing_notes'),
  ('electrical_takeoffs','drawing_ref'),
  ('electrical_takeoffs','has_text_layer'),
  ('electrical_takeoffs','id'),
  ('electrical_takeoffs','input_id'),
  ('electrical_takeoffs','markup_image_url'),
  ('electrical_takeoffs','page_height'),
  ('electrical_takeoffs','page_width'),
  ('electrical_takeoffs','questions'),
  ('electrical_takeoffs','quote_id'),
  ('electrical_takeoffs','revision'),
  ('electrical_takeoffs','status'),
  ('electrical_takeoffs','svg_overlay'),
  ('electrical_takeoffs','symbols'),
  ('electrical_takeoffs','total_text_elements'),
  ('electrical_takeoffs','updated_at'),
  ('electrical_takeoffs','user_answers'),
  ('electrical_takeoffs','verified_at'),
  ('electrical_takeoffs','verified_by'),
  ('internal_estimates','ai_suggestions'),
  ('internal_estimates','cost_breakdown'),
  ('internal_estimates','created_at'),
  ('internal_estimates','id'),
  ('internal_estimates','notes'),
  ('internal_estimates','quote_id'),
  ('internal_estimates','risk_notes'),
  ('internal_estimates','time_estimates'),
  ('internal_estimates','updated_at'),
  ('org_members','accepted_at'),
  ('org_members','created_at'),
  ('org_members','id'),
  ('org_members','invited_at'),
  ('org_members','org_id'),
  ('org_members','role'),
  ('org_members','user_id'),
  ('organizations','ai_credits_remaining'),
  ('organizations','billing_email'),
  ('organizations','brand_extracted_at'),
  ('organizations','brand_extracted_font_feel'),
  ('organizations','brand_extracted_primary_color'),
  ('organizations','brand_extracted_secondary_color'),
  ('organizations','brand_extracted_tone'),
  ('organizations','brand_extraction_error'),
  ('organizations','brand_extraction_status'),
  ('organizations','brand_primary_color'),
  ('organizations','brand_secondary_color'),
  ('organizations','branded_exclusions'),
  ('organizations','branded_payment_terms'),
  ('organizations','branded_signatory_name'),
  ('organizations','branded_signatory_position'),
  ('organizations','branded_terms'),
  ('organizations','brochure_deleted_at'),
  ('organizations','brochure_extracted_at'),
  ('organizations','brochure_file_key'),
  ('organizations','brochure_file_size'),
  ('organizations','brochure_file_url'),
  ('organizations','brochure_filename'),
  ('organizations','brochure_hash'),
  ('organizations','brochure_knowledge'),
  ('organizations','brochure_page_count'),
  ('organizations','company_address'),
  ('organizations','company_email'),
  ('organizations','company_logo'),
  ('organizations','company_name'),
  ('organizations','company_phone'),
  ('organizations','company_website'),
  ('organizations','contract_signatory_name'),
  ('organizations','contract_signatory_title'),
  ('organizations','contract_signature_image'),
  ('organizations','cover_stat_strip_enabled'),
  ('organizations','created_at'),
  ('organizations','default_day_work_rates'),
  ('organizations','default_exclusions'),
  ('organizations','default_hypercare_days'),
  ('organizations','default_insurance_limits'),
  ('organizations','default_m365_assumptions'),
  ('organizations','default_m365_methodology'),
  ('organizations','default_m365_out_of_scope'),
  ('organizations','default_m365_phases'),
  ('organizations','default_m365_risks'),
  ('organizations','default_m365_rollback'),
  ('organizations','default_payment_terms'),
  ('organizations','default_return_visit_rate'),
  ('organizations','default_server_assumptions'),
  ('organizations','default_server_methodology'),
  ('organizations','default_server_out_of_scope'),
  ('organizations','default_server_phases'),
  ('organizations','default_server_risks'),
  ('organizations','default_server_rollback'),
  ('organizations','default_signatory_name'),
  ('organizations','default_signatory_position'),
  ('organizations','default_surface_treatment'),
  ('organizations','default_tenant_assumptions'),
  ('organizations','default_tenant_methodology'),
  ('organizations','default_tenant_out_of_scope'),
  ('organizations','default_tenant_phases'),
  ('organizations','default_tenant_risks'),
  ('organizations','default_tenant_rollback'),
  ('organizations','default_terms'),
  ('organizations','default_validity_days'),
  ('organizations','default_working_days'),
  ('organizations','default_working_hours_end'),
  ('organizations','default_working_hours_start'),
  ('organizations','default_workspace_assumptions'),
  ('organizations','default_workspace_methodology'),
  ('organizations','default_workspace_out_of_scope'),
  ('organizations','default_workspace_phases'),
  ('organizations','default_workspace_risks'),
  ('organizations','default_workspace_rollback'),
  ('organizations','email_flags'),
  ('organizations','id'),
  ('organizations','max_catalog_items'),
  ('organizations','max_quotes_per_month'),
  ('organizations','max_users'),
  ('organizations','monthly_quote_count'),
  ('organizations','name'),
  ('organizations','proposal_orientation'),
  ('organizations','proposal_template'),
  ('organizations','quote_count_reset_at'),
  ('organizations','slug'),
  ('organizations','stripe_customer_id'),
  ('organizations','stripe_price_id'),
  ('organizations','stripe_subscription_id'),
  ('organizations','subscription_cancel_at_period_end'),
  ('organizations','subscription_current_period_end'),
  ('organizations','subscription_current_period_start'),
  ('organizations','subscription_status'),
  ('organizations','subscription_tier'),
  ('organizations','trial_ends_at'),
  ('organizations','trial_starts_at'),
  ('organizations','updated_at'),
  ('prospect_messages','content'),
  ('prospect_messages','created_at'),
  ('prospect_messages','id'),
  ('prospect_messages','input_tokens'),
  ('prospect_messages','output_tokens'),
  ('prospect_messages','role'),
  ('prospect_messages','thread_id'),
  ('prospect_threads','client_uuid'),
  ('prospect_threads','created_at'),
  ('prospect_threads','escalated_at'),
  ('prospect_threads','escalation_email'),
  ('prospect_threads','escalation_message'),
  ('prospect_threads','escalation_name'),
  ('prospect_threads','id'),
  ('prospect_threads','ip_address'),
  ('prospect_threads','last_page_path'),
  ('prospect_threads','start_page_path'),
  ('prospect_threads','status'),
  ('prospect_threads','updated_at'),
  ('prospect_threads','user_agent'),
  ('quote_inputs','content'),
  ('quote_inputs','created_at'),
  ('quote_inputs','file_key'),
  ('quote_inputs','file_url'),
  ('quote_inputs','filename'),
  ('quote_inputs','id'),
  ('quote_inputs','input_type'),
  ('quote_inputs','mime_type'),
  ('quote_inputs','processed_content'),
  ('quote_inputs','processing_error'),
  ('quote_inputs','processing_status'),
  ('quote_inputs','quote_id'),
  ('quote_line_items','category'),
  ('quote_line_items','cost_price'),
  ('quote_line_items','created_at'),
  ('quote_line_items','description'),
  ('quote_line_items','discount_percent'),
  ('quote_line_items','evidence_category'),
  ('quote_line_items','id'),
  ('quote_line_items','is_estimated'),
  ('quote_line_items','is_optional'),
  ('quote_line_items','is_passthrough'),
  ('quote_line_items','is_substitutable'),
  ('quote_line_items','item_name'),
  ('quote_line_items','phase_id'),
  ('quote_line_items','pricing_type'),
  ('quote_line_items','quantity'),
  ('quote_line_items','quote_id'),
  ('quote_line_items','rate'),
  ('quote_line_items','sort_order'),
  ('quote_line_items','source_input_ids'),
  ('quote_line_items','total'),
  ('quote_line_items','unit'),
  ('quote_line_items','updated_at'),
  ('quotes','accepted_at'),
  ('quotes','annual_total'),
  ('quotes','branded_slots'),
  ('quotes','client_address'),
  ('quotes','client_email'),
  ('quotes','client_name'),
  ('quotes','client_phone'),
  ('quotes','comprehensive_config'),
  ('quotes','cover_stat_cells_override'),
  ('quotes','created_at'),
  ('quotes','created_by_user_id'),
  ('quotes','description'),
  ('quotes','generated_documents'),
  ('quotes','hypercare_days'),
  ('quotes','id'),
  ('quotes','migration_assumptions'),
  ('quotes','migration_methodology'),
  ('quotes','migration_out_of_scope'),
  ('quotes','migration_phases'),
  ('quotes','migration_risks'),
  ('quotes','migration_rollback'),
  ('quotes','migration_type'),
  ('quotes','migration_type_suggested'),
  ('quotes','monthly_total'),
  ('quotes','org_id'),
  ('quotes','payment_terms'),
  ('quotes','processing_instructions'),
  ('quotes','proposal_template'),
  ('quotes','proposal_template_v2'),
  ('quotes','quote_mode'),
  ('quotes','reference'),
  ('quotes','sent_at'),
  ('quotes','signatory_name'),
  ('quotes','signatory_position'),
  ('quotes','status'),
  ('quotes','subtotal'),
  ('quotes','tax_amount'),
  ('quotes','tax_rate'),
  ('quotes','terms'),
  ('quotes','title'),
  ('quotes','total'),
  ('quotes','trade_preset'),
  ('quotes','updated_at'),
  ('quotes','user_id'),
  ('quotes','user_prompt'),
  ('quotes','valid_until'),
  ('support_messages','content'),
  ('support_messages','created_at'),
  ('support_messages','helpful'),
  ('support_messages','id'),
  ('support_messages','input_tokens'),
  ('support_messages','output_tokens'),
  ('support_messages','role'),
  ('support_messages','thread_id'),
  ('support_threads','created_at'),
  ('support_threads','escalated_at'),
  ('support_threads','escalation_business_name'),
  ('support_threads','escalation_contact_name'),
  ('support_threads','escalation_email'),
  ('support_threads','escalation_phone'),
  ('support_threads','id'),
  ('support_threads','last_page_path'),
  ('support_threads','org_id'),
  ('support_threads','resolved_at'),
  ('support_threads','resolved_by_user_id'),
  ('support_threads','start_page_path'),
  ('support_threads','status'),
  ('support_threads','summary'),
  ('support_threads','updated_at'),
  ('support_threads','user_id'),
  ('tender_contexts','assumptions'),
  ('tender_contexts','created_at'),
  ('tender_contexts','custom_sections'),
  ('tender_contexts','exclusions'),
  ('tender_contexts','id'),
  ('tender_contexts','notes'),
  ('tender_contexts','quote_id'),
  ('tender_contexts','symbol_mappings'),
  ('tender_contexts','updated_at'),
  ('usage_logs','action_type'),
  ('usage_logs','created_at'),
  ('usage_logs','credits_used'),
  ('usage_logs','id'),
  ('usage_logs','metadata'),
  ('usage_logs','org_id'),
  ('usage_logs','user_id'),
  ('users','company_address'),
  ('users','company_email'),
  ('users','company_logo'),
  ('users','company_name'),
  ('users','company_phone'),
  ('users','created_at'),
  ('users','default_terms'),
  ('users','default_trade_sector'),
  ('users','email'),
  ('users','email_verification_sent_at'),
  ('users','email_verification_token'),
  ('users','email_verified'),
  ('users','id'),
  ('users','is_active'),
  ('users','last_signed_in'),
  ('users','name'),
  ('users','password_hash'),
  ('users','role'),
  ('users','updated_at')
)
SELECT e.table_name, e.column_name
FROM expected e
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public'
      AND c.table_name   = e.table_name
      AND c.column_name  = e.column_name
WHERE c.column_name IS NULL
ORDER BY e.table_name, e.column_name;

\echo ''
\echo '=== 2. MISSING TABLES ==='
\echo '    Zero rows = every table the code expects exists.'

WITH expected(table_name) AS (VALUES
  
  ('catalog_items'),
  ('containment_takeoffs'),
  ('contract_documents'),
  ('electrical_takeoffs'),
  ('internal_estimates'),
  ('org_members'),
  ('organizations'),
  ('prospect_messages'),
  ('prospect_threads'),
  ('quote_inputs'),
  ('quote_line_items'),
  ('quotes'),
  ('support_messages'),
  ('support_threads'),
  ('tender_contexts'),
  ('usage_logs'),
  ('users')
)
SELECT e.table_name
FROM expected e
LEFT JOIN information_schema.tables x
       ON x.table_schema = 'public' AND x.table_name = e.table_name
WHERE x.table_name IS NULL
ORDER BY 1;

\echo ''
\echo '=== 3. RECENT MIGRATIONS — did each one land? ==='
\echo '    Every row should say YES.'

SELECT 'migration-phase2 (quotes.proposal_template_v2)' AS migration,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='quotes' AND column_name='proposal_template_v2')
            THEN 'YES' ELSE 'NO — NOT RUN' END AS applied
UNION ALL SELECT 'migration-discount-column (quote_line_items.discount_percent)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='quote_line_items' AND column_name='discount_percent')
            THEN 'YES' ELSE 'NO — NOT RUN' END
UNION ALL SELECT 'migration-generated-documents (quotes.generated_documents)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='quotes' AND column_name='generated_documents')
            THEN 'YES' ELSE 'NO — NOT RUN' END
UNION ALL SELECT 'migration-branded-slots (quotes.branded_slots)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='quotes' AND column_name='branded_slots')
            THEN 'YES' ELSE 'NO — NOT RUN' END
UNION ALL SELECT 'migration-contract-documents (table)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_name='contract_documents')
            THEN 'YES' ELSE 'NO — NOT RUN' END
UNION ALL SELECT 'migration-contract-documents (org_id+tier unique index)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                         WHERE indexname='contract_documents_org_tier_idx')
            THEN 'YES' ELSE 'NO — INDEX MISSING' END
UNION ALL SELECT 'migration-contract-documents (organizations signatory columns)',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                  WHERE table_name='organizations'
                    AND column_name IN ('contract_signature_image',
                                        'contract_signatory_name',
                                        'contract_signatory_title')) = 3
            THEN 'YES' ELSE 'NO — PARTIAL OR NOT RUN' END;

\echo ''
\echo '=== 4. VAT BACKFILL — organisations with no stored VAT rate ==='
\echo '    Zero rows = every org has a rate. Any row = migration-vat-backfill'
\echo '    never ran for that org, and its new quotes silently get 0%.'

SELECT id, name
FROM organizations
WHERE default_day_work_rates IS NULL
   OR (default_day_work_rates->>'defaultVatRate') IS NULL
   OR (default_day_work_rates->>'defaultVatRate') = ''
ORDER BY id;

\echo ''
\echo '=== 5. VAT BACKFILL — zero-VAT quotes inside a VAT-registered org ==='
\echo '    Zero rows = clean. Any row is a quote the backfill should have'
\echo '    corrected, or one created before the VAT fix deployed.'

SELECT q.id, q.org_id, q.reference, q.tax_rate, q.created_at::date
FROM quotes q
JOIN organizations o ON o.id = q.org_id
WHERE COALESCE(q.tax_rate, 0) = 0
  AND COALESCE((o.default_day_work_rates->>'defaultVatRate')::numeric, 0) > 0
ORDER BY q.id;

\echo ''
\echo '=== 6. DESCRIPTION SEPARATORS — old || and ## still in the data ==='
\echo '    Zero rows = migration-description-newlines converted everything.'
\echo '    Any row prints raw separators on a customer document.'

SELECT 'quote_line_items' AS source, id, left(description, 60) AS sample
FROM quote_line_items
WHERE description LIKE '%||%' OR description LIKE '%##%'
UNION ALL
SELECT 'catalog_items', id, left(description, 60)
FROM catalog_items
WHERE description LIKE '%||%' OR description LIKE '%##%'
ORDER BY 1, 2;

\echo ''
\echo '=== 7. SUPPORT HOURS — contract clauses with hours typed in ==='
\echo '    Zero rows = migration-support-hours-placeholder ran and every'
\echo '    contract now follows Settings.'

SELECT id, org_id, tier
FROM contract_documents
WHERE clauses::text LIKE '%Monday-Friday 9am-5pm%'
   OR clauses::text LIKE '%Monday-Friday 8:30am-5:30pm%'
ORDER BY id;

\echo ''
\echo '=== 8. SUMMARY — what the placeholder work left behind (informational) ==='

SELECT id, org_id, tier,
       (clauses::text LIKE '%{{supportHours}}%') AS uses_settings_hours
FROM contract_documents
ORDER BY id;

\echo ''
\echo '=== 9. SUMMARY — row counts, for a sense of scale (informational) ==='

SELECT 'organizations' AS table, count(*) FROM organizations
UNION ALL SELECT 'quotes', count(*) FROM quotes
UNION ALL SELECT 'quote_line_items', count(*) FROM quote_line_items
UNION ALL SELECT 'catalog_items', count(*) FROM catalog_items
UNION ALL SELECT 'contract_documents', count(*) FROM contract_documents
UNION ALL SELECT 'quotes with branded_slots', count(*) FROM quotes WHERE branded_slots IS NOT NULL
UNION ALL SELECT 'quotes with generated_documents', count(*) FROM quotes WHERE generated_documents IS NOT NULL
ORDER BY 1;

\echo ''
\echo '=== AUDIT COMPLETE ==='
\echo 'Sections 1-7 should all be empty. Anything listed there needs action.'
