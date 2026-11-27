-- REST-89: grant the new AI scan permissions to roles that already hold the matching write
-- permission, so existing Managers (and custom roles) keep the same reach. Hand-written data move.
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "role_id", 'menu:scan' FROM "role_permissions" WHERE "permission_key" = 'menu:write'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "role_id", 'inventory:scan-invoice' FROM "role_permissions" WHERE "permission_key" = 'inventory:manage'
ON CONFLICT DO NOTHING;
