import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function main() {
  const result = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    ORDER BY ordinal_position
  `);
  console.log('Users table columns:');
  result.rows.forEach(r => console.log('  -', r.column_name));
  
  const quotes = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'quotes' 
    ORDER BY ordinal_position
  `);
  console.log('\nQuotes table columns:');
  quotes.rows.forEach(r => console.log('  -', r.column_name));
  
  const lineItems = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'quote_line_items'
    ORDER BY ordinal_position
  `);
  console.log('\nLine items table columns:');
  lineItems.rows.forEach(r => console.log('  -', r.column_name));
  
  const inputs = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'quote_inputs'
    ORDER BY ordinal_position
  `);
  console.log('\nQuote inputs table columns:');
  inputs.rows.forEach(r => console.log('  -', r.column_name));
  
  const catalog = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'catalog_items'
    ORDER BY ordinal_position
  `);
  console.log('\nCatalog items table columns:');
  catalog.rows.forEach(r => console.log('  -', r.column_name));
  
  await pool.end();
}
main().catch(console.error);
