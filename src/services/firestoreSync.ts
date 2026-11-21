import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AuthSession,
  DemandSignal,
  InventoryMovement,
  Order,
  PickTask,
  StockVerification,
  TransferDecision,
  TransferRecommendation,
} from '../types';

/**
 * Persists authenticated user profile and key user-generated mutations
 * to Cloud Firestore when signed in via Firebase Google Auth.
 * Enforces strict payload bounds matching firebase-blueprint.json.
 */

export async function syncUserProfileToFirestore(session: AuthSession): Promise<void> {
  if (session.authMode !== 'FIREBASE_GOOGLE') return;
  const path = `users/${session.uid}`;
  try {
    await setDoc(
      doc(db, 'users', session.uid),
      {
        uid: session.uid.slice(0, 128),
        displayName: (session.displayName || 'Customer').slice(0, 100),
        email: session.email.slice(0, 160),
        city: (session.city || 'Bengaluru').slice(0, 60),
        preferredStoreId: (session.preferredStoreId || 'indiranagar').slice(0, 64),
        role: 'CUSTOMER',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncOrderAndTaskToFirestore(
  session: AuthSession,
  order: Order,
  tasks: PickTask[]
): Promise<void> {
  if (session.authMode !== 'FIREBASE_GOOGLE') return;
  const orderPath = `orders/${order.id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'orders', order.id), {
      id: order.id.slice(0, 64),
      orderNumber: order.orderNumber.slice(0, 32),
      customerId: session.uid.slice(0, 128),
      customerName: order.customerName.slice(0, 100),
      customerEmail: order.customerEmail.slice(0, 160),
      customerPhone: order.customerPhone.slice(0, 30),
      shippingAddress: order.shippingAddress.slice(0, 260),
      city: order.city.slice(0, 60),
      storeId: order.storeId.slice(0, 64),
      storeName: order.storeName.slice(0, 100),
      fulfilmentPreference: order.fulfilmentPreference,
      fulfilmentNote: order.fulfilmentNote.slice(0, 260),
      status: order.status,
      subtotalInr: order.subtotalInr,
      deliveryFeeInr: order.deliveryFeeInr,
      totalInr: order.totalInr,
      items: order.items.slice(0, 20),
      timeline: order.timeline.slice(0, 20),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const task of tasks) {
      batch.set(doc(db, 'pickTasks', task.id), {
        id: task.id.slice(0, 64),
        orderId: task.orderId.slice(0, 64),
        orderNumber: task.orderNumber.slice(0, 32),
        customerId: session.uid.slice(0, 128),
        storeId: task.storeId.slice(0, 64),
        storeName: task.storeName.slice(0, 100),
        productId: task.productId.slice(0, 64),
        productName: task.productName.slice(0, 140),
        quantity: task.quantity,
        status: task.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, orderPath);
  }
}

export async function syncDemandSignalToFirestore(
  session: AuthSession,
  signal: DemandSignal
): Promise<void> {
  if (session.authMode !== 'FIREBASE_GOOGLE') return;
  const path = `demandSignals/${signal.id}`;
  try {
    await setDoc(doc(db, 'demandSignals', signal.id), {
      id: signal.id.slice(0, 64),
      userId: session.uid.slice(0, 128),
      query: signal.query.slice(0, 140),
      inferredCategory: signal.inferredCategory.slice(0, 60),
      ...(signal.inferredProductId ? { inferredProductId: signal.inferredProductId.slice(0, 64) } : {}),
      locality: signal.locality.slice(0, 80),
      outcome: signal.outcome,
      ...(signal.signalSource ? { signalSource: signal.signalSource } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncVerificationToFirestore(
  session: AuthSession,
  verification: StockVerification
): Promise<void> {
  if (session.authMode !== 'FIREBASE_GOOGLE' || session.email !== 'nishchalas.official@gmail.com') return;
  const path = `verifications/${verification.id}`;
  try {
    await setDoc(doc(db, 'verifications', verification.id), {
      id: verification.id.slice(0, 64),
      storeId: verification.storeId.slice(0, 64),
      productId: verification.productId.slice(0, 64),
      productName: verification.productName.slice(0, 140),
      recordedQty: verification.recordedQty,
      verifiedQty: verification.verifiedQty,
      previousSellableQty: verification.previousSellableQty,
      newSellableQty: verification.newSellableQty,
      discrepancyDelta: verification.discrepancyDelta,
      ...(verification.discrepancyReason ? { discrepancyReason: verification.discrepancyReason.slice(0, 240) } : {}),
      verifiedBy: verification.verifiedBy.slice(0, 120),
      verifiedByUid: session.uid.slice(0, 128),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncTransferDecisionToFirestore(
  session: AuthSession,
  recommendation: TransferRecommendation,
  decision: TransferDecision
): Promise<void> {
  if (session.authMode !== 'FIREBASE_GOOGLE' || session.email !== 'nishchalas.official@gmail.com') return;
  const path = `transferDecisions/${decision.id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'transferRecommendations', recommendation.id), {
      id: recommendation.id.slice(0, 64),
      sourceStoreId: recommendation.sourceStoreId.slice(0, 64),
      sourceStoreName: recommendation.sourceStoreName.slice(0, 100),
      destinationStoreId: recommendation.destinationStoreId.slice(0, 64),
      destinationStoreName: recommendation.destinationStoreName.slice(0, 100),
      productId: recommendation.productId.slice(0, 64),
      productName: recommendation.productName.slice(0, 140),
      recommendedQty: recommendation.recommendedQty,
      reason: recommendation.reason.slice(0, 300),
      sourceSellableQty: recommendation.sourceSellableQty,
      destinationSellableQty: recommendation.destinationSellableQty,
      demandSignalCount: recommendation.demandSignalCount,
      status: recommendation.status,
      ...(recommendation.requestedBy ? { requestedBy: recommendation.requestedBy.slice(0, 120) } : {}),
      ...(recommendation.requestedByRole ? { requestedByRole: recommendation.requestedByRole } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'transferDecisions', decision.id), {
      id: decision.id.slice(0, 64),
      recommendationId: decision.recommendationId.slice(0, 64),
      sourceStoreId: decision.sourceStoreId.slice(0, 64),
      destinationStoreId: decision.destinationStoreId.slice(0, 64),
      productId: decision.productId.slice(0, 64),
      productName: decision.productName.slice(0, 140),
      quantity: decision.quantity,
      decision: decision.decision,
      notes: decision.notes.slice(0, 260),
      decidedBy: decision.decidedBy.slice(0, 120),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncInventoryMovementsToFirestore(
  session: AuthSession,
  movements: InventoryMovement[]
): Promise<void> {
  if (session.authMode !== 'FIREBASE_GOOGLE' || session.email !== 'nishchalas.official@gmail.com') return;
  if (movements.length === 0) return;
  const path = `inventoryMovements/${movements[0].id}`;
  try {
    const batch = writeBatch(db);
    for (const mov of movements.slice(0, 20)) {
      batch.set(doc(db, 'inventoryMovements', mov.id), {
        id: mov.id.slice(0, 64),
        movementType: mov.movementType,
        storeId: mov.storeId.slice(0, 64),
        storeName: mov.storeName.slice(0, 100),
        productId: mov.productId.slice(0, 64),
        productName: mov.productName.slice(0, 140),
        quantityDelta: mov.quantityDelta,
        beforeVerifiedQty: mov.beforeVerifiedQty,
        afterVerifiedQty: mov.afterVerifiedQty,
        beforeSellableQty: mov.beforeSellableQty,
        afterSellableQty: mov.afterSellableQty,
        referenceId: mov.referenceId.slice(0, 64),
        notes: mov.notes.slice(0, 300),
        actorName: mov.actorName.slice(0, 100),
        actorRole: mov.actorRole,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserOrdersFromFirestore(uid: string): Promise<Partial<Order>[]> {
  const path = 'orders';
  try {
    const q = query(collection(db, 'orders'), where('customerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Partial<Order>);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
