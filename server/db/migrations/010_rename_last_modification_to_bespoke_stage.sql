UPDATE production_stages
SET name = 'Bespoke'
WHERE name = 'Last Modification'
  AND NOT EXISTS (
    SELECT 1 FROM production_stages WHERE name = 'Bespoke'
  );
