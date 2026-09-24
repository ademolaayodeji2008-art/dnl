# v4.0 Acceptance Checklist

Test in this order and stop if any existing working feature regresses.

1. Login / logout / remember email / notification bell.
2. Staff list, add/import/export, activate/deactivate.
3. User creation, roles, activate/deactivate, admin password reset.
4. Expense categories.
5. Multiple approval workflows, levels and approvers.
6. Raise PV with multiple expense lines and automatic PV number.
7. Attach PDF/image/DOCX/XLSX before submission.
8. Raiser can view/download/remove attachments before approval.
9. Approver can view/download attachments but cannot alter them.
10. Approval / rejection / revision / resubmission.
11. Approved PV locks editing and attachment removal.
12. Payable Officer sees full PV + documents and records payment.
13. Raiser confirms receipt; expense posting remains correct.
14. Dashboard and Top 7 expense view.
15. Reports: date/category/status filters, preview, Excel, print/PDF.
16. Advanced Search and pagination.
17. Audit Trail filters and pagination.
18. Company logo upload and printed PV branding.
19. System Health page.
20. Run `npm run backup` and restore only into a disposable test database before production use.

Email notification configuration is intentionally optional and disabled by default.
Actual hosting/deployment is intentionally excluded from this build.
