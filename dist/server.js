"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2025-11-17.clover",
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
app.get("/payment/config", (req, res) => {
    res.json({
        name: "Custom Stripe",
        description: "Pay securely via Stripe",
        enabled: true,
    });
});
app.post("/payment/charge", (req, res) => {
    console.log("Charge request payload:", req.body);
    res.status(501).json({ ok: false, error: "Not implemented yet" });
});
app.get("/checkout.js", (req, res) => {
    const publicUrl = process.env.PUBLIC_URL || "https://bc-stripe-gateway.onrender.com";
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_REPLACE_ME";
    const js = `
    console.log('[Custom Stripe] checkout.js loaded');

    document.addEventListener('DOMContentLoaded', function () {
      console.log('[Custom Stripe] DOM ready');

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

        async function getCheckoutId() {
          try {
            const res = await fetch('/api/storefront/cart', {
              credentials: 'include',
            });

            if (!res.ok) {
              console.error('[Custom Stripe] /api/storefront/cart failed', res.status);
              return null;
            }

            const cart = await res.json();
            if (!Array.isArray(cart) || !cart.length) {
              console.warn('[Custom Stripe] no cart found');
              return null;
            }

            const cart = cart[0];
            const id = cart.id || cart.cartId || cart.cart_id;
            if (!id) {
              console.warn('[Custom Stripe] cart has no id/cartId/cart_id field');
              return null;
            }
            console.log('[Custom Stripe] cart id from storefront:', id);
            return id;
          } catch (e) {
            console.error('[Custom Stripe] error getting cart id', e);
            return null;
          }
        }

        async function initPaymentElement() {
           if (elements && paymentElement && paymentClientSecret) {
            return;
          }

          const checkoutId = await getCheckoutId();
          if (!checkoutId) {
            throw new Error('Missing checkout ID; cannot create PaymentIntent');
          }

          console.log('[Custom Stripe] creating PaymentIntent for checkout', checkoutId);

          const resp = await fetch('${publicUrl}/payment/create-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkoutId }),
          });

          const data = await resp.json();

          if (!resp.ok) {
            throw new Error(data.error || 'Failed to create PaymentIntent');
          }

          paymentClientSecret = data.clientSecret;

          elements = stripe.elements({
            clientSecret: paymentClientSecret,
            appearance: { theme: 'stripe' },
            loader: 'auto',
          });

          paymentElement = elements.create('payment');
          paymentElement.mount('#custom-stripe-payment-element');
        }

        function injectCustomPaymentMethod(attempts) {
          if (attempts <= 0) {
            console.log('[Custom Stripe] giving up injecting payment method');
            return;
          }

          var paymentContainer = document.querySelector(
            'form[data-test="payment-form"] ul.form-checklist.optimizedCheckout-form-checklist'
          );

          if (!paymentContainer) {
            console.log('[Custom Stripe] payment container not found, retrying...');
            return setTimeout(function () {
              injectCustomPaymentMethod(attempts - 1);
            }, 500);
          }

          console.log(
            '[Custom Stripe] injecting payment method into:',
            paymentContainer.tagName,
            paymentContainer.className
          );

          var wrapper = document.createElement('li');
          wrapper.className =
            'form-checklist-item optimizedCheckout-form-checklist-item form-checklist-item--selected optimizedCheckout-form-checklist-item--selected';

          wrapper.innerHTML = \`
            <div class="form-checklist-header form-checklist-header--selected">
              <div class="form-field">
                <input
                  id="radio-custom-stripe"
                  type="radio"
                  class="form-checklist-checkbox optimizedCheckout-form-checklist-checkbox"
                  name="paymentProviderRadio"
                  value="custom-stripe"
                  checked
                />
                <label
                  for="radio-custom-stripe"
                  class="form-label optimizedCheckout-form-label"
                >
                  <div class="paymentProviderHeader-container">
                    <div
                      class="paymentProviderHeader-nameContainer"
                      data-test="payment-method-custom-stripe"
                    >
                      <div
                        class="paymentProviderHeader-name"
                        data-test="payment-method-name"
                      >
                        Pay with Custom Stripe
                      </div>
                    </div>
                    <div class="paymentProviderHeader-cc"></div>
                  </div>
                </label>
              </div>
            </div>
            <div aria-live="polite" class="form-checklist-body">
              <div id="custom-stripe-fields" class="payment-method">
                <div
                  id="custom-stripe-payment-element"
                  class="optimizedCheckout-form-input"
                ></div>
                <div id="custom-stripe-errors" class="form-field--error"></div>
                <button
                  type="button"
                  id="custom-stripe-pay"
                  class="button button--primary optimizedCheckout-buttonPrimary"
                  style="margin-top: 1rem;"
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

          var radio = wrapper.querySelector('#radio-custom-stripe');
          var fields = wrapper.querySelector('#custom-stripe-fields');
          var errorDiv = wrapper.querySelector('#custom-stripe-errors');
          var payButton = wrapper.querySelector('#custom-stripe-pay');


          if (fields) {
            fields.style.display = 'block';
          }

          // init Payment Element immediately so the card form appears
          (async function () {
            try {
              await initPaymentElement();
            } catch (e) {
              console.error('[Custom Stripe] Error initialising Payment Element:', e);
              if (errorDiv) {
                errorDiv.textContent = e.message || 'Error initialising payment form';
              }
            }
          })();

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

                // REQUIRED for clover Payment Element submit before confirmPayment
                const { error: submitError } = await elements.submit();
                if (submitError) {
                  console.error('[Custom Stripe] submit error:', submitError);
                  errorDiv.textContent = submitError.message || 'Payment failed';
                  payButton.disabled = false;
                  payButton.textContent = 'Pay with Custom Stripe';
                  return;
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
    res.type("application/javascript").send(js);
});
const port = process.env.PORT || 3000;
app.post('/payment/create-intent', async (req, res) => {
    var _a;
    try {
        const { checkoutId } = req.body;
        if (!checkoutId) {
            return res.status(400).json({ error: 'checkoutId is required' });
        }
        if (!process.env.BC_STORE_HASH || !process.env.BC_STOREFRONT_API_TOKEN) {
            console.error('[Custom Stripe] Missing BC_STORE_HASH or BC_STOREFRONT_API_TOKEN');
            return res
                .status(500)
                .json({ error: 'BigCommerce API is not configured on the server' });
        }
        // 1) Create an incomplete order from the checkout
        const orderResp = await fetch(`https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}/v3/checkouts/${checkoutId}/orders`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': process.env.BC_STOREFRONT_API_TOKEN,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
        if (!orderResp.ok) {
            const text = await orderResp.text();
            console.error('[Custom Stripe] create order failed', orderResp.status, text);
            return res
                .status(500)
                .json({ error: 'Failed to create order from checkout in BigCommerce' });
        }
        const orderJson = await orderResp.json();
        const order = orderJson.data;
        console.log('[Custom Stripe] Created order from checkout:', order);
        const currency = (order.currency.code || order.currency || 'GBP').toLowerCase();
        const amountDecimal = (_a = order.total_inc_tax) !== null && _a !== void 0 ? _a : order.total_ex_tax;
        if (amountDecimal == null) {
            console.error('[Custom Stripe] No amount in order data:', order);
            return res
                .status(500)
                .json({ error: 'Could not determine order total from BigCommerce' });
        }
        const amount = Math.round(Number(amountDecimal) * 100);
        console.log('[Custom Stripe] Creating PaymentIntent for order', order.id, 'amount =', amount, 'currency =', currency);
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            automatic_payment_methods: { enabled: true },
            setup_future_usage: 'off_session',
            metadata: {
                bc_order_id: String(order.id),
                bc_checkout_id: String(checkoutId),
            },
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
