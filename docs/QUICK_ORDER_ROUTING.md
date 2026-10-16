# Quick orders: contact extraction and destination routing

Quick contact parsing removes a recognized Vietnamese phone number before looking for the address. Street/house numbers remain intact. It recognizes ngõ, ngách, phố and hẻm as well as the previous administrative address markers. The shared parser runs in the chat action and server-side order context.

Settings → Đơn vị vận chuyển includes a workspace default destination. New order forms show connected Viettel Post accounts and Pancake POS shop/warehouse connections. Expired VTP tokens still require reconnecting when sending directly through VTP; choosing POS does not depend on that token.

The order stores `fulfillmentTarget`. POS orders are held until the form explicitly calls `/api/pos/orders/:id/dispatch`. The normal POS worker processes the durable job, resolves customer/product links, sends the documented order payload, and reads it back before returning `done`. The response includes the POS order ID, provider status, warehouse, recipient, address, items, fees, verified payment amount and carrier tracking when available. Bank transfer input is an intent, not verified receipt of money. New POS orders retain draft/new status for processing in POS.

Repeated dispatch calls reuse the same job and order. `unknown`, `conflict` and `sending` are never reset for blind retries. The quick order form retains its saved local order ID after partial failure and locks edits. Carrier dispatch rejects an order routed to POS; the POS worker skips orders routed to a carrier or another POS account. Pre-existing orders without routing metadata retain their existing synchronization behavior.

The default is owner-managed. Order dispatch and its status require order permission and customer scope; credentials remain server-side. An active shop must still authorize order creation and have its own valid courier configuration to ship from POS. Creating an order in POS does not create a direct VTP shipment here.

Tests: `tests/chat-contact-data.test.mjs`, `tests/order-routing.test.mjs`, `tests/pancake-pos.test.mjs`, `tests/shipping-viettelpost.test.mjs`, and `scripts/test-quick-order-routing-ui.mjs`. Provider writes are mocked. The production check only read the connected shop's warehouses; it did not create a test customer, product, order or shipment in the real shop.
