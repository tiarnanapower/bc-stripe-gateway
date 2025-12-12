import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Healthcheck
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Config endpoint
app.get('/payment/config', (req: Request, res: Response) => {
  res.json({
    name: 'Custom Stripe',
    description: 'Pay securely via Stripe',
    enabled: true,
  });
});

// Placeholder charge endpoint
app.post('/payment/charge', (req: Request, res: Response) => {
  console.log('Charge request payload:', req.body);
  res.status(501).json({ ok: false, error: 'Not implemented yet' });
});

app.get('/checkout.js', (req: Request, res: Response) => {
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
