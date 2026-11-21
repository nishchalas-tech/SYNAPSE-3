/**
 * Security Rules Specification Verification Suite (Dirty Dozen Payloads)
 * Documents the 12 adversarial payloads blocked by firestore.rules.
 */

export interface DirtyDozenCase {
  id: string;
  targetPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  enforcedBy: string;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 'DD-01-ROLE-ESCALATION',
    targetPath: '/users/attacker_uid',
    operation: 'create',
    payload: { uid: 'attacker_uid', role: 'NETWORK_ADMIN', displayName: 'Mallory', email: 'm@example.com' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().role == "CUSTOMER" unless isAdmin()',
  },
  {
    id: 'DD-02-SHADOW-UPDATE',
    targetPath: '/users/user_1',
    operation: 'update',
    payload: { displayName: 'Bob', isAdminOverride: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'affectedKeys().hasOnly(["displayName", "city", "preferredStoreId", "updatedAt"])',
  },
  {
    id: 'DD-03-UNVERIFIED-ADMIN-EMAIL',
    targetPath: '/stores/indiranagar',
    operation: 'update',
    payload: { isOpen: false },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'request.auth.token.email_verified == true in isVerified() and isAdmin()',
  },
  {
    id: 'DD-04-ID-POISONING',
    targetPath: `/orders/${'a'.repeat(512)}`,
    operation: 'create',
    payload: { id: 'a'.repeat(512), customerId: 'user_1' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isValidId(orderId) max size 128 and regex ^[a-zA-Z0-9_\\-]+$',
  },
  {
    id: 'DD-05-PII-READ',
    targetPath: '/users/victim_uid',
    operation: 'get',
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isOwner(userId) || isAdmin()',
  },
  {
    id: 'DD-06-ORDER-LIST-SCRAPE',
    targetPath: '/orders',
    operation: 'list',
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'resource.data.customerId == request.auth.uid || isAdmin()',
  },
  {
    id: 'DD-07-SPOOFED-ORDER-OWNER',
    targetPath: '/orders/ord_spoof',
    operation: 'create',
    payload: { id: 'ord_spoof', customerId: 'victim_uid', status: 'CONFIRMED' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isValidOrder(incoming()) verifying incoming().customerId == request.auth.uid',
  },
  {
    id: 'DD-08-TIMESTAMP-FORGERY',
    targetPath: '/orders/ord_time',
    operation: 'create',
    payload: { id: 'ord_time', customerId: 'user_1', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().createdAt == request.time && incoming().updatedAt == request.time',
  },
  {
    id: 'DD-09-TERMINAL-ORDER-MUTATION',
    targetPath: '/orders/ord_done',
    operation: 'update',
    payload: { status: 'CONFIRMED' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'existing().status != "COMPLETED" unless isAdmin()',
  },
  {
    id: 'DD-10-CUSTOMER-INVENTORY-WRITE',
    targetPath: '/inventory/indiranagar_mbp14',
    operation: 'update',
    payload: { sellableQty: 999 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isAdmin() || isStoreManagerOf(existing().storeId)',
  },
  {
    id: 'DD-11-NON-ADMIN-TRANSFER-APPROVAL',
    targetPath: '/transferRecommendations/rec_1',
    operation: 'update',
    payload: { status: 'APPROVED' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isAdmin() only on transferRecommendations',
  },
  {
    id: 'DD-12-CROSS-STORE-PICK-REJECT',
    targetPath: '/pickTasks/task_indiranagar_1',
    operation: 'update',
    payload: { status: 'REJECTED', rejectionReason: 'Cross store tamper' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedBy: 'isStoreManagerOf(existing().storeId) || isAdmin()',
  },
];
