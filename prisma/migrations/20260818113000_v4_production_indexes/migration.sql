CREATE INDEX IF NOT EXISTS "Voucher_status_createdAt_idx" ON "Voucher"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Voucher_raisedById_createdAt_idx" ON "Voucher"("raisedById", "createdAt");
CREATE INDEX IF NOT EXISTS "Voucher_department_createdAt_idx" ON "Voucher"("department", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
