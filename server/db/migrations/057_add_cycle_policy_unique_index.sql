CREATE UNIQUE INDEX IF NOT EXISTS uq_rms_cycle_policy_wh_item
ON rms_cycle_count_policies (warehouse_id, item_id)
WHERE item_id IS NOT NULL;
