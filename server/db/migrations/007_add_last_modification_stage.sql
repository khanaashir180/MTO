INSERT INTO production_stages (name, sequence)
VALUES ('Last Modification', 12)
ON CONFLICT (sequence) DO NOTHING;
