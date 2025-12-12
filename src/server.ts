import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import Stripe from 'stripe';
import fetch from 'node-fetch';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover',
});

const app = express();

app.use(cors());
app.use(bodyParser.json());

async function getBigCommerceCheckout(checkoutId: string) {
  const storeHash = process.env.BC_STORE_HASH;
  const token = process.env.BC_STOREFRONT_API_TOKEN;

  if (!storeHash || !token) {
    throw new Error('BC_STORE_HASH or BC_STOREFRONT_API_TOKEN not set');
  }

  const url = `https://store-${storeHash}.mybigcommerce.com/api/storefront/checkouts/${checkoutId}`;

  const resp = await fetch(url, {
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

  return resp.json() as Promise<any>;
}



app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});


app.get('/payment/config', (req: Request, res: Response) => {
  res.json({
    name: 'Custom Stripe',
    description: 'Pay securely via Stripe',
    enabled: true,
  });
});


app.post('/payment/charge', (req: Request, res: Response) => {
  console.log('Charge request payload:', req.body);
  res.status(501).json({ ok: false, error: 'Not implemented yet' });
});app.get('/checkout.js', (req: Request, res: Response) => {
  const publicUrl = process.env.PUBLIC_URL || 'https://bc-stripe-gateway.onrender.com';

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

      function getCheckoutId() {
        try {
          var params = new URLSearchParams(window.location.search);
          return params.get('checkoutId');
        } catch (e) {
          console.error('[Custom Stripe] could not read checkoutId from URL', e);
          return null;
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

          var stripe = Stripe('${process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_REPLACE_ME'}');
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

                // get checkoutId instead of hardcoded amount
                var checkoutId = getCheckoutId();
                if (!checkoutId) {
                  errorDiv.textContent = 'Missing checkout ID cannot create payment.';
                  payButton.disabled = false;
                  payButton.textContent = 'Pay with Custom Stripe';
                  return;
                }

                const resp = await fetch('${publicUrl}/payment/create-intent', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ checkoutId: checkoutId }),
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
app.post('/payment/create-intent', async (req: Request, res: Response) => {
  try {
    const { checkoutId } = req.body;

    if (!checkoutId) {
      return res.status(400).json({ error: 'checkoutId is required' });
    }

    // 1) Load checkout from BigCommerce
    const checkout = await getBigCommerceCheckout(checkoutId);

    // Shape can vary slightly by API version, so we’re defensive:
    const grandTotal =
      checkout?.grand_total ||
      checkout?.cart?.grand_total ||
      checkout?.outstandingBalance;

    const currencyCode =
      checkout?.currency?.code ||
      checkout?.cart?.currency?.code ||
      'GBP';

    if (!grandTotal || !currencyCode) {
      console.error('[Custom Stripe] Missing totals from BC checkout', checkout);
      return res.status(400).json({ error: 'Could not determine checkout total' });
    }

    // BigCommerce usually returns something like 10.00; Stripe wants integer minor units
    const amount = Math.round(Number(grandTotal) * 100);

    console.log(
      `[Custom Stripe] Creating PaymentIntent for checkout ${checkoutId}:`,
      amount,
      currencyCode
    );

    // 2) Create Stripe PaymentIntent with correct amount & currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currencyCode.toLowerCase(), // e.g. 'gbp'
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session',
      metadata: {
        bc_checkout_id: checkoutId,
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    console.error('[Custom Stripe] create-intent error:', error);
    res
      .status(500)
      .json({ error: error.message || 'Something went wrong creating PaymentIntent' });
  }
});


app.listen(port, () => {
  console.log(`Custom payment app listening on port ${port}`);
});

