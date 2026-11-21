# SYNAPSE Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity Integrity**: Every `/users/{userId}` document must have `uid == request.auth.uid`, and users may only self-register with `role == 'CUSTOMER'`. Role elevation to `STORE_MANAGER` or `NETWORK_ADMIN` is governed strictly by `/managers/{uid}`, `/admins/{uid}`, or the verified bootstrapped admin email (`nishchalas.official@gmail.com`).
2. **PII Isolation**: User profiles (`/users/{userId}`) and customer orders (`/orders/{orderId}`) contain PII (`email`, `customerPhone`, `shippingAddress`). Reads are strictly limited to the document owner (`customerId == request.auth.uid`), the assigned store manager for order fulfilment, or verified Network Administrators.
3. **Path Variable Hardening**: Every single-document `get`, `create`, `update`, `delete` enforces `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, max 128 chars).
4. **Temporal & Immutable Integrity**: `createdAt` and `updatedAt` are strictly validated against `request.time` on Firestore writes; `customerId`, `uid`, and `orderId` are immutable on update.
5. **Action-Based Updates & Terminal State Locking**: Orders at `COMPLETED` and pick tasks/transfer recommendations at terminal states cannot be mutated by non-admin users. Updates enforce `affectedKeys().hasOnly(...)` combined with `isValid[Entity](incoming())`.
6. **Master Gate for Cart Subcollection**: `/users/{userId}/cart/{itemId}` checks parent `/users/{userId}` ownership via `get()` and strict `userId == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Role Self-Escalation**: Creating `/users/attacker` with `{ role: "NETWORK_ADMIN" }` -> `PERMISSION_DENIED`.
2. **Ghost Field Shadow Update**: Updating `/users/u1` with `{ displayName: "Bob", isVerifiedAdmin: true }` -> `PERMISSION_DENIED`.
3. **Unverified Email Spoofing**: Request with `email: "nishchalas.official@gmail.com"` and `email_verified: false` -> `PERMISSION_DENIED`.
4. **ID Poisoning**: Creating `/orders/<2000-char-id>` -> `PERMISSION_DENIED`.
5. **Cross-User PII Read**: Authenticated user A reading `/users/userB` -> `PERMISSION_DENIED`.
6. **Blanket Order List Scraping**: Authenticated user running unfiltered `getDocs(collection(db, 'orders'))` -> `PERMISSION_DENIED`.
7. **Spoofed Order Owner**: Creating `/orders/ord_1` with `customerId: "victim_uid"` -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: Creating `/orders/ord_1` with `createdAt: "1999-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Terminal Order Mutation**: Non-admin updating an order whose `status == "COMPLETED"` -> `PERMISSION_DENIED`.
10. **Unauthorized Inventory Adjustment**: Customer attempting to update `/inventory/indiranagar_lap_mbp14` -> `PERMISSION_DENIED`.
11. **Unauthorized Transfer Approval**: Customer or Store Manager attempting to update `/transferRecommendations/rec_1` -> `PERMISSION_DENIED`.
12. **Cross-Store Manager Mutation**: Manager of `whitefield` attempting to accept/reject `/pickTasks/task_indiranagar` -> `PERMISSION_DENIED`.
