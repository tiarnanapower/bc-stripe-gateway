"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-11-17.clover',
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
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


      var stripeScript = document.createElement('script');
      stripeScript.src = 'https://js.stripe.com/v3/';
      stripeScript.onload = function () {
        console.log('[Custom Stripe] Stripe.js loaded');
        setupCustomStripe();
      };
      document.head.appendChild(stripeScript);

      function setupCustomStripe() {
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

          console.log('[Custom Stripe] injecting payment method into:', paymentContainer.tagName, paymentContainer.className);

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

                // TEMP: hardcoded for test
                var amount = 1000; // £10.00
                var currency = 'gbp';

                const resp = await fetch('${publicUrl}/payment/create-intent', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ amount, currency }),
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
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
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
