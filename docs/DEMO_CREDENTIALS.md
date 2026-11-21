# SYNAPSE Demo Credentials

All three portals can be entered via one-click role cards on `/login` or by entering the demo credentials below.

## 1. Customer Storefront (`CUSTOMER`)
- **Email:** `customer@synapse.demo`
- **Password:** `synapse-customer-2026`
- **Default Store:** SYNAPSE Indiranagar

## 2. Store Manager Portal (`STORE_MANAGER`)
- **Email:** `manager.indiranagar@synapse.demo`
- **Password:** `synapse-manager-2026`
- **Assigned Store Scope:** SYNAPSE Indiranagar

## 3. Network Administrator Portal (`NETWORK_ADMIN`)
- **Email:** `admin@synapse.demo`
- **Password:** `synapse-admin-2026`
- **Scope:** All 4 Bengaluru Demo Store Nodes (Indiranagar, Jayanagar, Whitefield, Electronic City)

## Google Sign-In (Firebase Authentication)
Users may also sign in with Google via Firebase Authentication on `/login`. Authenticated user profiles, orders, and demand signals synchronize with Cloud Firestore under `firestore.rules`.

*Disclaimer: Frontend route protection and local demo credentials are for demonstration workflows only. Production authentication and role enforcement will be handled by the Python FastAPI backend.*
