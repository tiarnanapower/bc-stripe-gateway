"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const stripe_1 = __importDefault(require("stripe"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-11-17.clover',
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
async function getBigCommerceCheckout(checkoutId) {
    const storeHash = process.env.BC_STORE_HASH;
    const token = process.env.BC_STOREFRONT_API_TOKEN;
    if (!storeHash || !token) {
        throw new Error('BC_STORE_HASH or BC_STOREFRONT_API_TOKEN not set');
    }
    const url = `https://store-${storeHash}.mybigcommerce.com/api/storefront/checkouts/${checkoutId}`;
    const resp = await (0, node_fetch_1.default)(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    if (!resp.ok) {
        const text = await resp.text();
        console.error('[Custom Stripe] BC checkout error', resp.status, text);
        throw new Error(`Failed to load checkout ${checkoutId}`);
    }
    return resp.json();
}
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.get('/payment/config', (req, res) => {
    res.json({
        name: 'Custom Stripe',
        description: 'Pay securely via Stripe',
        enabled: true,
    });
});
app.post('/payment/charge', (req, res) => {
    console.log('Charge request payload:', req.body);
    res.status(501).json({ ok: false, error: 'Not implemented yet' });
});
app.get('/checkout.js', (req, res) => {
    const publicUrl = process.env.PUBLIC_URL || 'https://bc-stripe-gateway.onrender.com';
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_REPLACE_ME';
    const js = `
    console.log('[Custom Stripe] checkout.js loaded');

    document.addEventListener('DOMContentLoaded', function () {
      console.log('[Custom Stripe] DOM ready');

      // Load Stripe.js
      var stripeJs = document.createElement('script');
      stripeJs.src = 'https://js.stripe.com/v3/';
      stripeJs.onload = function () {
        console.log('[Custom Stripe] Stripe.js loaded');
        setupCustomStripePayment();
      };
      document.head.appendChild(stripeJs);

      function getOrderTotalFromDom() {
        try {
          var candidates = [
            '[data-test="cart-total-grand-total"]',
            '.cart-total-grandTotal .cart-total-value',
            '.cart-total-grandTotal',
            '.cart-total .cart-total-value'
          ];

          for (var i = 0; i < candidates.length; i++) {
            var el = document.querySelector(candidates[i]);
            if (!el) continue;

            var text = (el.textContent || '').trim();
            if (!text) continue;

            console.log('[Custom Stripe] grand total text from DOM:', text);

            // Strip currency symbols and commas, keep digits and dot
            var numeric = text.replace(/[^0-9.,]/g, '').replace(',', '');
            var value = parseFloat(numeric);

            if (!isNaN(value) && value > 0) {
              return value; // e.g. 123.45
            }
          }

          console.error('[Custom Stripe] could not find grand total in DOM');
          return null;
        } catch (e) {
          console.error('[Custom Stripe] error reading grand total from DOM', e);
          return null;
        }
      }

      function getCurrencyFromDom() {
        try {
          var candidates = [
            '[data-test="cart-total-grand-total"]',
            '.cart-total-grandTotal .cart-total-value',
            '.cart-total-grandTotal',
            '.cart-total .cart-total-value'
          ];

          for (var i = 0; i < candidates.length; i++) {
            var el = document.querySelector(candidates[i]);
            if (!el) continue;

            var text = (el.textContent || '').trim();
            if (!text) continue;

            if (text.indexOf('GBP') !== -1 || text.indexOf('£') !== -1) return 'gbp';
            if (text.indexOf('EUR') !== -1 || text.indexOf('€') !== -1) return 'eur';
            if (text.indexOf('USD') !== -1 || text.indexOf('$') !== -1) return 'usd';

            // fallback to your main currency
            return 'gbp';
          }

          return 'gbp';
        } catch (e) {
          console.error('[Custom Stripe] error reading currency from DOM', e);
          return 'gbp';
        }
      }

      function setupCustomStripePayment() {
        function injectCustomPaymentMethod(attempts) {
          if (attempts <= 0) return;

          var paymentContainer =
            document.querySelector('[data-test="payment-methods"]') ||
            document.querySelector('.checkout-step--payment') ||
            document.body;

          if (!paymentContainer) {
            console.log('[Custom Stripe] payment container not found, retrying...');
            return setTimeout(function () {
              injectCustomPaymentMethod(attempts - 1);
            }, 500);
          }

          console.log('[Custom Stripe] injecting payment method');

          var wrapper = document.createElement('div');
          wrapper.className = 'form-checklist-item custom-stripe-method';
          wrapper.innerHTML = \`
            <div class="form-checklist">
              <div class="form-field">
                <input
                  type="radio"
                  id="custom-stripe"
                  name="paymentProvider"
                  class="form-radio"
                />
                <label class="form-label" for="custom-stripe">
                  Pay with Custom Stripe
                </label>
              </div>
              <div id="custom-stripe-fields" style="display:none; margin-left: 2rem;">
                <div id="custom-stripe-card-element" style="max-width: 400px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
                <div id="custom-stripe-errors" style="color:#c00; margin-top:8px;"></div>
                <button type="button" id="custom-stripe-pay" class="button button--primary" style="margin-top:12px;">
                  Pay with Custom Stripe
                </button>
              </div>
            </div>
          \`;

          paymentContainer.appendChild(wrapper);

          var radio = wrapper.querySelector('#custom-stripe');
          var fields = wrapper.querySelector('#custom-stripe-fields');
          var cardElementDiv = wrapper.querySelector('#custom-stripe-card-element');
          var errorDiv = wrapper.querySelector('#custom-stripe-errors');
          var payButton = wrapper.querySelector('#custom-stripe-pay');

          var stripe = Stripe('${publishableKey}');
          var elements = stripe.elements();
          var card = elements.create('card');
          card.mount(cardElementDiv);

          if (radio && fields && payButton) {
            radio.addEventListener('change', function () {
              console.log('[Custom Stripe] selected');
              fields.style.display = 'block';
            });

            payButton.addEventListener('click', async function () {
              try {
                errorDiv.style.color = '#c00';
                errorDiv.textContent = '';
                payButton.disabled = true;
                payButton.textContent = 'Processing...';

                var total = getOrderTotalFromDom();
                var currency = getCurrencyFromDom();

                console.log('[Custom Stripe] using total from DOM:', total, currency);

                if (!total) {
                  errorDiv.textContent = 'Could not read order total from page.';
                  payButton.disabled = false;
                  payButton.textContent = 'Pay with Custom Stripe';
                  return;
                }

                var amount = Math.round(total * 100); // e.g. 123.45 -> 12345

                const resp = await fetch('${publicUrl}/payment/create-intent', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ amount: amount, currency: currency }),
                });

                const data = await resp.json();

                if (!resp.ok) {
                  throw new Error(data.error || 'Failed to create PaymentIntent');
                }

                const clientSecret = data.clientSecret;

                const result = await stripe.confirmCardPayment(clientSecret, {
                  payment_method: { card: card },
                });

                if (result.error) {
                  console.error('[Custom Stripe] Payment error:', result.error);
                  errorDiv.textContent = result.error.message || 'Payment failed';
                  payButton.disabled = false;
                  payButton.textContent = 'Pay with Custom Stripe';
                  return;
                }

                console.log('[Custom Stripe] Payment success:', result.paymentIntent.status);
                errorDiv.style.color = 'green';
                errorDiv.textContent = 'Payment succeeded (demo).';
                payButton.disabled = false;
                payButton.textContent = 'Pay with Custom Stripe';
              } catch (err) {
                console.error('[Custom Stripe] Error:', err);
                errorDiv.textContent = err.message || 'Something went wrong';
                payButton.disabled = false;
                payButton.textContent = 'Pay with Custom Stripe';
              }
            });
          }
        }

        injectCustomPaymentMethod(10);
      }
    });
  `;
    res.type('application/javascript').send(js);
});
const port = process.env.PORT || 3000;
app.post('/payment/create-intent', async (req, res) => {
    try {
        const { amount, currency } = req.body;
        if (!amount || !currency) {
            return res.status(400).json({ error: 'amount and currency are required' });
        }
        console.log('[Custom Stripe] creating PaymentIntent:', amount, currency);
        const paymentIntent = await stripe.paymentIntents.create({
            amount, // integer minor units
            currency, // e.g. 'gbp'
            automatic_payment_methods: { enabled: true },
            setup_future_usage: 'off_session',
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    }
    catch (error) {
        console.error('[Custom Stripe] create-intent error:', error);
        res.status(500).json({ error: error.message || 'Something went wrong' });
    }
});
app.listen(port, () => {
    console.log(`Custom payment app listening on port ${port}`);
});
