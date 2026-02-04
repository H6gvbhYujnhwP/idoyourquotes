#!/usr/bin/env node
/**
 * Migration script to add organization layer
 * Run with: node scripts/migrate-to-orgs.mjs
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

async function main() {
  // Parse the MySQL connection URL
  const url = new URL(DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 4000,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
  });

  console.log('Connected to database');

  try {
    // 1. Create organizations table
    console.log('Creating organizations table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        company_name VARCHAR(255),
        company_address TEXT,
        company_phone VARCHAR(50),
        company_email VARCHAR(320),
        company_logo TEXT,
        default_terms TEXT,
        billing_email VARCHAR(320),
        stripe_customer_id VARCHAR(255),
        ai_credits_remaining INT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Create org_members table
    console.log('Creating org_members table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS org_members (
        id SERIAL PRIMARY KEY,
        org_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
        invited_at TIMESTAMP NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 3. Create usage_logs table
    console.log('Creating usage_logs table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id SERIAL PRIMARY KEY,
        org_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        credits_used INT NOT NULL DEFAULT 1,
        metadata JSON,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 4. Add org_id to quotes table
    console.log('Adding org_id to quotes table...');
    try {
      await connection.execute(`ALTER TABLE quotes ADD COLUMN org_id BIGINT UNSIGNED`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      console.log('  org_id column already exists in quotes');
    }

    // 5. Add created_by_user_id to quotes table
    console.log('Adding created_by_user_id to quotes table...');
    try {
      await connection.execute(`ALTER TABLE quotes ADD COLUMN created_by_user_id BIGINT UNSIGNED`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      console.log('  created_by_user_id column already exists in quotes');
    }

    // 6. Add org_id to catalogItems table
    console.log('Adding org_id to catalogItems table...');
    try {
      await connection.execute(`ALTER TABLE catalogItems ADD COLUMN org_id BIGINT UNSIGNED`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      console.log('  org_id column already exists in catalogItems');
    }

    // 7. Create tender_contexts table if not exists
    console.log('Creating tender_contexts table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tender_contexts (
        id SERIAL PRIMARY KEY,
        quote_id BIGINT UNSIGNED NOT NULL UNIQUE,
        symbol_mappings JSON,
        assumptions JSON,
        exclusions JSON,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 8. Create internal_estimates table if not exists
    console.log('Creating internal_estimates table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS internal_estimates (
        id SERIAL PRIMARY KEY,
        quote_id BIGINT UNSIGNED NOT NULL UNIQUE,
        notes TEXT,
        cost_breakdown JSON,
        time_estimates JSON,
        risk_notes TEXT,
        ai_suggestions JSON,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 9. Migrate existing users to organizations
    console.log('Migrating existing users to organizations...');
    const [users] = await connection.execute('SELECT * FROM users');
    
    for (const user of users) {
      // Check if user already has an org
      const [existingMemberships] = await connection.execute(
        'SELECT * FROM org_members WHERE user_id = ?',
        [user.id]
      );

      if (existingMemberships.length > 0) {
        console.log(`  User ${user.email} already has an organization, skipping`);
        continue;
      }

      // Create org for user
      const orgName = user.name || user.email.split('@')[0];
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50) + '-' + Date.now().toString(36);
      
      await connection.execute(
        `INSERT INTO organizations (name, slug, company_name, company_address, company_phone, company_email, billing_email) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orgName, slug, user.companyName, user.companyAddress, user.companyPhone, user.companyEmail, user.email]
      );

      // Get the inserted org ID
      const [orgs] = await connection.execute('SELECT * FROM organizations WHERE slug = ?', [slug]);
      const org = orgs[0];

      // Add user as owner
      await connection.execute(
        'INSERT INTO org_members (org_id, user_id, role, accepted_at) VALUES (?, ?, ?, NOW())',
        [org.id, user.id, 'owner']
      );

      // Update user's quotes to belong to this org
      await connection.execute(
        'UPDATE quotes SET org_id = ?, created_by_user_id = ? WHERE userId = ?',
        [org.id, user.id, user.id]
      );

      // Update user's catalog items to belong to this org
      await connection.execute(
        'UPDATE catalogItems SET org_id = ? WHERE userId = ?',
        [org.id, user.id]
      );

      console.log(`  Created org "${org.name}" (${org.slug}) for user ${user.email}`);
    }

    console.log('Migration completed successfully!');
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
