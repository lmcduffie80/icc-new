import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

for (const crop of ['corn', 'soybeans', 'cotton']) {
  const rows = await sql`
    SELECT DISTINCT ON (app.product_id)
      app.product_id,
      p.name AS product_name,
      app.default_rate_per_acre,
      app.min_rate,
      app.max_rate,
      app.rate_unit,
      app.unit_size,
      app.unit_size_unit,
      app.lbs_per_gallon
    FROM acre_pack_pass_products app
    JOIN acre_pack_passes ap ON ap.id = app.pass_id
    JOIN acre_pack_programs prog ON prog.id = ap.program_id
    JOIN products p ON p.id = app.product_id
    WHERE prog.crop = ${crop}
      AND prog.is_active = true
    ORDER BY app.product_id, app.sort_order
  `;
  console.log(`\n${crop.toUpperCase()} approved rates (${rows.length} products):`);
  for (const r of rows) {
    console.log(`  ${r.product_name}: ${r.min_rate}–${r.max_rate} ${r.rate_unit}/acre, unit_size: ${r.unit_size} ${r.unit_size_unit}`);
  }
}
