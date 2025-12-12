"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
// Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
// Config endpoint
app.get('/payment/config', (req, res) => {
    res.json({
        name: 'Custom Stripe',
        description: 'Pay securely via Stripe',
        enabled: true,
    });
});
// Placeholder charge endpoint
app.post('/payment/charge', (req, res) => {
    console.log('Charge request payload:', req.body);
    res.status(501).json({ ok: false, error: 'Not implemented yet' });
});
app.get('/checkout.js', (req, res) => {
    const js = `
    console.log('[Custom Stripe] checkout.js loaded');

    document.addEventListener('DOMContentLoaded', function () {
      console.log('[Custom Stripe] DOM ready');

      function injectCustomPaymentMethod(attempts) {
        if (attempts <= 0) return;

        var paymentContainer =
          document.querySelector('[data-test="payment-methods"]') ||
          document.querySelector('.checkout-step--payment');

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
              <p>Custom Stripe payment method goes here.</p>
            </div>
          </div>
        \`;

        paymentContainer.appendChild(wrapper);

        var radio = wrapper.querySelector('#custom-stripe');
        var fields = wrapper.querySelector('#custom-stripe-fields');

        if (radio && fields) {
          radio.addEventListener('change', function () {
            console.log('[Custom Stripe] selected');
            fields.style.display = 'block';
          });
        }
      }

      injectCustomPaymentMethod(10);
    });
  `;
    res.type('application/javascript').send(js);
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Custom payment app listening on port ${port}`);
});
//8.29.230.139
