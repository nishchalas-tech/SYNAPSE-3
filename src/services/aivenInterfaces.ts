import type {
  DemandSignal,
  FulfilmentPreference,
  InventoryRecord,
  Order,
  PickTask,
  Product,
  ProductCategory,
  StockVerification,
  Store,
  TransferDecision,
  TransferRecommendation,
} from '../types';

/**
 * Integration Contracts for the Target FastAPI + Aiven Architecture
 *
 * Production deployment target:
 * - Backend API: Python FastAPI REST API
 * - Aiven PostgreSQL: Relational source of truth + transactional outbox
 * - Aiven Apache Kafka: Event distribution across retail nodes
 * - Aiven OpenSearch: Typo-tolerant product discovery & faceted search
 *
 * In the current frontend phase, demo workflows execute against the shared
 * local/Firestore demo repository while preserving these exact service boundaries.
 */

export interface FastApiClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

export type AivenKafkaTopicEvent =
  | { type: 'ORDER_PLACED'; payload: Pick<Order, 'id' | 'orderNumber' | 'storeId' | 'totalInr'> }
  | {
      type: 'INVENTORY_CHANGED';
      payload: Pick<InventoryRecord, 'storeId' | 'productId' | 'recordedQty' | 'verifiedQty' | 'sellableQty'>;
    }
  | { type: 'PICK_ACCEPTED'; payload: Pick<PickTask, 'id' | 'orderId' | 'storeId'> }
  | {
      type: 'PICK_REJECTED';
      payload: Pick<PickTask, 'id' | 'orderId' | 'storeId' | 'rejectionReason'>;
    }
  | { type: 'DEMAND_SIGNAL_RECORDED'; payload: DemandSignal }
  | { type: 'TRANSFER_APPROVED'; payload: TransferDecision };

export interface OpenSearchQueryParams {
  query: string;
  category?: ProductCategory | 'All';
  minPriceInr?: number;
  maxPriceInr?: number;
  city?: string;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc';
}

export interface OpenSearchResult {
  products: Array<{
    product: Product;
    relevanceScore: number;
    matchedTerms: string[];
    didYouMean?: string;
  }>;
  total: number;
  correctedQuery?: string;
}

export interface VisualSearchAnalysis {
  detectedObject: string;
  category: string;
  keywords: string[];
  visualSummary: string;
  suggestedQuery: string;
  isElectronicsHardware: boolean;
}

export interface VisualSearchMatch {
  product: Product;
  visualSimilarity: number; // 0..1 cosine similarity from gemini-embedding-2
  openSearchScore: number; // normalized 0..1 OpenSearch lexical & attribute relevance
  hybridScore: number; // weighted composite score 0..1
  matchedTerms: string[];
}

export interface VisualSearchApiResponse {
  embeddingDimensions: number;
  indexedCatalogSize: number;
  visualAnalysis: VisualSearchAnalysis;
  vectorScores: Array<{
    productId: string;
    cosineSimilarity: number;
  }>;
}

export interface OpenSearchDiscoveryService {
  search(params: OpenSearchQueryParams): Promise<OpenSearchResult>;
  suggest(prefix: string): Promise<string[]>;
  visualSearch?(payload: {
    imageBase64: string;
    mimeType: string;
    textHint?: string;
  }): Promise<VisualSearchMatch[]>;
}

export interface PostgresRetailRepository {
  listStores(): Promise<Store[]>;
  listProducts(): Promise<Product[]>;
  listInventory(storeId?: string): Promise<InventoryRecord[]>;
  submitVerification(input: {
    storeId: string;
    productId: string;
    verifiedQty: number;
    discrepancyReason?: string;
  }): Promise<StockVerification>;
  createOrder(input: {
    storeId: string;
    preference: FulfilmentPreference;
  }): Promise<Order>;
  listPickTasks(storeId: string): Promise<PickTask[]>;
  listTransferRecommendations(): Promise<TransferRecommendation[]>;
}

export interface KafkaEventBus {
  publishOutboxEvent(event: AivenKafkaTopicEvent): Promise<void>;
}
