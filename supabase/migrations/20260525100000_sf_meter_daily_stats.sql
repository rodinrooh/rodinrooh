CREATE TABLE sf_meter_daily_stats (
  date date PRIMARY KEY,
  total_sessions integer NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0
);

ALTER TABLE sf_meter_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon select" ON sf_meter_daily_stats FOR SELECT TO anon USING (true);
