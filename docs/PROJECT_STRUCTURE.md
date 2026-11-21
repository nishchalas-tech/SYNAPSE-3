# SYNAPSE Project Structure

```
src/
  assets/images/             # Generated studio hardware & showroom imagery
  components/
    fulfilment/
      ProductRescuePanel.tsx # Priority 1/2/3 out-of-stock recovery module
      TradeoffSlider.tsx     # Save Money / Get It Faster / Shop Nearby selector
    products/
      ProductCard.tsx        # Storefront product card with live store availability
      ProductImage.tsx       # Resilient image slot with fallback container
    shared/
      ProtectedRoute.tsx     # Role-based frontend route guard
    ui/
      ErrorBoundary.tsx      # React error boundary for runtime recovery
      StatusBadge.tsx        # Accessible semantic status indicator
  context/
    AuthContext.tsx          # Firebase Google Auth + Role-based demo session state
    NetworkContext.tsx       # Shared cross-portal retail state & business workflows
  data/
    seedData.ts              # 4 Bengaluru demo stores, 10 SKUs, 40 inventory cells, seeded tasks/signals
  layouts/
    AdminLayout.tsx          # Network Administrator sidebar & header shell
    CustomerLayout.tsx       # 3-zone top bar customer storefront shell
    ManagerLayout.tsx        # Store-scoped manager sidebar & header shell
  pages/
    admin/                   # 9 Network Administrator portal pages
    auth/                    # LoginPage (Google Auth + Demo Accounts + Register) & AccessDeniedPage
    customer/                # 11 Customer Storefront pages
    manager/                 # 5 Store Manager portal pages
  services/
    aivenInterfaces.ts       # Target FastAPI / PostgreSQL / Kafka / OpenSearch service contracts
    discoveryService.ts      # Typo-tolerant search, synonyms, facets, and suggestions
    firestoreSync.ts         # Cloud Firestore persistence helpers for authenticated sessions
    fulfilmentService.ts     # Trade-off Slider ranking, Sellable Stock formula, Product Rescue
    networkRepository.ts     # Shared localStorage persistence and demo reset utility
  types/
    index.ts                 # Shared TypeScript domain interfaces
  utils/
    formatters.ts            # INR currency formatting, freshness calculation, status metadata
  firebase.ts                # Firebase SDK init, testConnection(), structured error handler
  App.tsx                    # React Router route definitions across all 3 portals
```
