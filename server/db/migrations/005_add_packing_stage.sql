INSERT INTO production_stages (name, sequence)
VALUES ('Packing', 9)
ON CONFLICT (name) DO NOTHING;
