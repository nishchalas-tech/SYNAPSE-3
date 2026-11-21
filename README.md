# SYNAPSE — The Intelligent, Connected Retail Network

**Team:** pip install win!  
**Hackathon:** Aiven — Build the Online Store

SYNAPSE connects a multi-store physical electronics retail chain into one intelligent online shopping and fulfilment network across four core pillars:
1. **Intelligent Discovery** — Typo-tolerant and natural-language search across Laptops, Monitors, Keyboards, Mice, and Headphones.
2. **Stock Whisperer** — Operational inventory intelligence distinguishing system-recorded stock, physically verified counts, active reservations, and sellable stock with time-based freshness signals.
3. **Adaptive Fulfilment** — Interactive Trade-off Slider (`Save Money`, `Get It Faster`, `Shop Nearby`), three-tier Product Rescue, and automated alternate-store evaluation when a store manager rejects a pick task.
4. **Demand Radar & Surplus Exchange** — Unmatched search & out-of-stock demand signals paired with explainable inter-store transfer recommendations.

---

## Running Locally

```bash
npm install
npm run dev
```

The Vite development server runs on `http://localhost:3000`.

### Type-checking & Production Build

```bash
npm run lint
npm run build
```

---

## Authentication & Demo Accounts

See `docs/DEMO_CREDENTIALS.md` for all three role-based demo accounts (`CUSTOMER`, `STORE_MANAGER`, `NETWORK_ADMIN`). Google Sign-In via Firebase Authentication is also enabled alongside Cloud Firestore synchronization for authenticated sessions.

*Note: Local demo accounts use browser `localStorage` persistence for rapid cross-portal workflow testing. Production authentication, RBAC enforcement, and transactional outbox event streaming belong in the Python FastAPI backend.*

---

## Future Backend Integration Target

Service contracts in `src/services/aivenInterfaces.ts` prepare the frontend for integration with:
- **Python FastAPI REST API**
- **Aiven PostgreSQL** (stores, products, inventory, carts, orders, reservations, pick tasks, verifications, demand signals, transfer decisions, outbox events)
- **Aiven Apache Kafka** (`ORDER_PLACED`, `INVENTORY_CHANGED`, `PICK_ACCEPTED`, `PICK_REJECTED`, `DEMAND_SIGNAL_RECORDED`, `TRANSFER_APPROVED`)
- **Aiven OpenSearch** (typo-tolerant full-text search, category/price facets, relevance ranking)
