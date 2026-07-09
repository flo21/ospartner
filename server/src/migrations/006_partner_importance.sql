ALTER TABLE partners ADD COLUMN business_priority TEXT CHECK (business_priority IN ('stratégique', 'haute', 'moyenne', 'basse'));
ALTER TABLE partners ADD COLUMN estimated_revenue_share REAL;

UPDATE partners
SET business_priority = CASE
    WHEN name = 'Alpes Tandem' THEN 'stratégique'
    WHEN upper(name) = 'PARIS MONTARGIS' THEN 'haute'
    WHEN name = 'Azur Parachutisme' THEN 'moyenne'
    ELSE business_priority
  END,
  estimated_revenue_share = CASE
    WHEN name = 'Alpes Tandem' THEN 10
    WHEN upper(name) = 'PARIS MONTARGIS' THEN 5
    WHEN name = 'Azur Parachutisme' THEN 3
    ELSE estimated_revenue_share
  END
WHERE name IN ('Alpes Tandem', 'Azur Parachutisme') OR upper(name) = 'PARIS MONTARGIS';
