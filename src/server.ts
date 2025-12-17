import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover',
});

const app = express();

app.use(cors());
app.use(bodyParser.json());


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
});
app.get('/checkout.js', (req: Request, res: Response) => {
  const publicUrl = process.env.PUBLIC_URL || 'https://bc-stripe-gateway.onrender.com';
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_REPLACE_ME';

  const js = `
    console.log('[Custom Stripe] checkout.js loaded');

    document.addEventListener('DOMContentLoaded', function () {
      console.log('[Custom Stripe] DOM ready');

      // Load Stripe.js (v3)
      var stripeScript = document.createElement('script');
      stripeScript.src = 'https://js.stripe.com/clover/stripe.js';
      stripeScript.onload = function () {
        console.log('[Custom Stripe] Stripe.js loaded');
        setupCustomStripe();
      };
      document.head.appendChild(stripeScript);

      function setupCustomStripe() {
        var stripe = Stripe('${publishableKey}');
        var elements = null;
        var paymentElement = null;
        var paymentClientSecret = null;

        async function initPaymentElement() {
          if (elements && paymentElement && paymentClientSecret) {
            return;
          }

          // TODO: later replace with real BC total & currency
          var amount = 1000; // £10.00 test
          var currency = 'gbp';

          console.log('[Custom Stripe] creating PaymentIntent for', amount, currency);

          const resp = await fetch('${publicUrl}/payment/create-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount, currency: currency }),
          });

          const data = await resp.json();

          if (!resp.ok) {
            throw new Error(data.error || 'Failed to create PaymentIntent');
          }

          paymentClientSecret = data.clientSecret;

          elements = stripe.elements({
            clientSecret: paymentClientSecret,
            appearance: { theme: 'stripe' },
            loader: 'auto'
          });

          paymentElement = elements.create('payment');
          paymentElement.mount('#custom-stripe-payment-element');
        }

        function injectCustomPaymentMethod(attempts) {
          if (attempts <= 0) return;

          var paymentContainer =
            document.querySelector('.checkout-step--payment .form-checklist') ||
            document.querySelector('[data-test="payment-methods"]') ||
            document.body;

          if (!paymentContainer) {
            console.log('[Custom Stripe] payment container not found, retrying...');
            return setTimeout(function () {
              injectCustomPaymentMethod(attempts - 1);
            }, 500);
          }

          console.log('[Custom Stripe] injecting payment method into:', paymentContainer.tagName, paymentContainer.className);

          var wrapper = document.createElement('li');
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
              <div id="custom-stripe-fields" class="payment-method" style="display:none;">
                <div id="custom-stripe-payment-element" class="optimizedCheckout-form-input"></div>
                <div id="custom-stripe-errors" class="form-field--error"></div>
                <button
                  type="button"
                  id="custom-stripe-pay"
                  class="button button--primary optimizedCheckout-buttonPrimary"
                >
                  Pay with Custom Stripe
                </button>
              </div>
            </div>
          \`;

          if (paymentContainer.firstChild) {
            paymentContainer.insertBefore(wrapper, paymentContainer.firstChild);
          } else {
            paymentContainer.appendChild(wrapper);
          }

          var radio = wrapper.querySelector('#custom-stripe');
          var fields = wrapper.querySelector('#custom-stripe-fields');
          var errorDiv = wrapper.querySelector('#custom-stripe-errors');
          var payButton = wrapper.querySelector('#custom-stripe-pay');

          if (radio && fields && payButton) {
            radio.addEventListener('change', async function () {
              console.log('[Custom Stripe] selected');
              fields.style.display = 'block';

              try {
                await initPaymentElement();
              } catch (e) {
                console.error('[Custom Stripe] Error initialising Payment Element:', e);
                errorDiv.textContent = e.message || 'Error initialising payment form';
              }
            });

            payButton.addEventListener('click', async function () {
              try {
                errorDiv.style.color = '#c00';
                errorDiv.textContent = '';
                payButton.disabled = true;
                payButton.textContent = 'Processing...';

                if (!elements || !paymentElement || !paymentClientSecret) {
                  await initPaymentElement();
                }

                const { error } = await stripe.confirmPayment({
                  elements: elements,
                  clientSecret: paymentClientSecret,
                  redirect: 'if_required',
                });

                if (error) {
                  console.error('[Custom Stripe] Payment error:', error);
                  errorDiv.textContent = error.message || 'Payment failed';
                  payButton.disabled = false;
                  payButton.textContent = 'Pay with Custom Stripe';
                  return;
                }

                console.log('[Custom Stripe] Payment success');
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
  } catch (error: any) {
    console.error('[Custom Stripe] create-intent error:', error);
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
});

app.listen(port, () => {
  console.log(`Custom payment app listening on port ${port}`);
});

