CREATE TABLE IF NOT EXISTS sf_meter_blocks (
  street_block text PRIMARY KEY,
  lat numeric,
  lng numeric,
  geocoded_at timestamptz default now()
);

ALTER TABLE sf_meter_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon select" ON sf_meter_blocks FOR SELECT TO anon USING (true);