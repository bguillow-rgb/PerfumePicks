-- Timberline DNA Layer (M1) launch-gate flag. app_settings is key/value text
-- (see 202605151200_ai_usage_tables.sql). The client fails closed: the layer
-- is OFF until this row is explicitly truthy. Run manually in the SQL editor.
insert into app_settings (key, value) values ('dna_layer_enabled','true') on conflict (key) do update set value=excluded.value;
