import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-11-17.clover",
});

const allowedOrigins = [
  "https://france-1742885.mybigcommerce.com",
];

const app = express();

app.use( cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("[Custom Stripe] Blocked CORS origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }));
app.use(bodyParser.json());

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/payment/config", (req: Request, res: Response) => {
  res.json({
    name: "Custom Stripe",
    description: "Pay securely via Stripe",
    enabled: true,
  });
});

app.post("/payment/charge", (req: Request, res: Response) => {
  console.log("Charge request payload:", req.body);
  res.status(501).json({ ok: false, error: "Not implemented yet" });
});
app.get("/checkout.js", (req: Request, res: Response) => {
  const publicUrl =
    process.env.PUBLIC_URL || "https://bc-stripe-gateway.onrender.com";
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_REPLACE_ME";

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

        var bcOrderId = null;
        var bcCheckoutId = null;

        async function getCheckoutId() {
          try {
            const res = await fetch('/api/storefront/cart', {
              credentials: 'include',
            });

            if (!res.ok) {
              console.error('[Custom Stripe] /api/storefront/cart failed', res.status);
              return null;
            }

            const data = await res.json();
            console.log('[Custom Stripe] storefront cart response', data);
            const carts = Array.isArray(data) ? data : data.data;
            if (!Array.isArray(carts) || !carts.length) {
              console.warn('[Custom Stripe] no carts found in storefront response');
              return null;
            }

            const cart = carts[0];
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
          bcOrderId = data.orderId;
          bcCheckoutId = data.checkoutId || checkoutId;


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

                const { error, paymentIntent } = await stripe.confirmPayment({
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

                console.log('[Custom Stripe] Payment success', paymentIntent && paymentIntent.id);

                // tell backend payment succeeded so it can update order + build redirect URL 
                if (!bcOrderId || !bcCheckoutId) {
                  console.error('[Custom Stripe] Missing BC order/checkout IDs');
                  errorDiv.textContent = 'Payment succeeded, but order data is missing.';
                  payButton.disabled = false;
                  payButton.textContent = 'Pay with Custom Stripe';
                  return;
                }

                const confirmResp = await fetch('${publicUrl}/payment/confirm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    orderId: bcOrderId,
                    checkoutId: bcCheckoutId,
                    paymentIntentId: paymentIntent && paymentIntent.id,
                  }),
                });

                const confirmData = await confirmResp.json();

                if (!confirmResp.ok) {
                  console.error('[Custom Stripe] confirm failed:', confirmData);
                  errorDiv.textContent = confirmData.error || 'Order finalisation failed';
                  payButton.disabled = false;
                  payButton.textContent = 'Pay with Custom Stripe';
                  return;
                }

                // Finally redirect to BC order confirmation
                if (confirmData.redirectUrl) {
                  window.location.href = confirmData.redirectUrl;
                  return;
                }

                // fallback
                errorDiv.style.color = 'green';
                errorDiv.textContent = 'Payment succeeded (but no redirect URL returned).';
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
app.post("/payment/create-intent", async (req: Request, res: Response) => {
  try {
    const { checkoutId } = req.body;
    if (!checkoutId) {
      return res.status(400).json({ error: "checkoutId is required" });
    }

    if (!process.env.BC_STORE_HASH || !process.env.BC_API_TOKEN) {
      console.error(
        "[Custom Stripe] Missing BC_STORE_HASH or BC_API_TOKEN"
      );
      return res
        .status(500)
        .json({ error: "BigCommerce API is not configured on the server" });
    }

    // 1 Create an incomplete order from the checkout api
    const orderResp = await fetch(
      `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}/v3/checkouts/${checkoutId}/orders`,
      {
        method: "POST",
        headers: {
          "X-Auth-Token": process.env.BC_API_TOKEN,
          Accept: "application/json",
          "Content-Type": "application/json",
        }
      }
    );

   if (!orderResp.ok) {
        const text = await orderResp.text();
        console.error('[Custom Stripe] create order failed', orderResp.status, text);
        throw new Error('Failed to create order from checkout in BigCommerce');
      }

      const orderJson = await orderResp.json();
      const order = orderJson.data;
      if (!order || !order.id) {
        console.error('[Custom Stripe] Invalid order response', orderJson);
        throw new Error('Invalid order data received from BigCommerce');
      }

        // 2 Fetch the incomplete order from the order api
       const orderData = await fetch(
      `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}/v2/orders/${order.id}`,
      {
        method: "GET",
        headers: {
          "X-Auth-Token": process.env.BC_API_TOKEN,
          Accept: "application/json",
          "Content-Type": "application/json",
        }
      }
      );

      if (!orderData.ok) {
        const text = await orderData.text();
        console.error('[Custom Stripe] fetch order details failed', orderData.status, text);
        throw new Error('Failed to fetch order details from BigCommerce');
      }

      const orderDataJson = await orderData.json();
      const unpackOrderData = orderDataJson;

  
      const amountDecimal = unpackOrderData.total_inc_tax ?? unpackOrderData.total_ex_tax ?? unpackOrderData.order_amount;
      if (amountDecimal == null) {
        console.error('[Custom Stripe] No amount field in order data', unpackOrderData);
        throw new Error('Could not determine order total from BigCommerce');
      }


      if (!unpackOrderData.currency_code) {
        console.error('[Custom Stripe] No currency_code in order data', unpackOrderData);
        throw new Error('Could not determine order currency from BigCommerce');
      }

      console.log(unpackOrderData)
      console.log(amountDecimal)
      const currency = unpackOrderData.currency_code.toLowerCase();
      const amount = Math.round(Number(amountDecimal) * 100);
          console.log(
      "[Custom Stripe] Creating PaymentIntent for order",
      order.id,
      "amount =",
      amount,
      "currency =",
      currency
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: "off_session",
      metadata: {
        bc_order_id: String(order.id),
        bc_checkout_id: String(checkoutId),
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret,   
      orderId: order.id,
  checkoutId, });
  } catch (error: any) {
    console.error("[Custom Stripe] create-intent error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
});

app.post("/payment/confirm", async (req: Request, res: Response) => {
  try {
    const { orderId, checkoutId, paymentIntentId } = req.body;

    if (!orderId || !paymentIntentId) {
      return res.status(400).json({ error: "orderId and paymentIntentId are required" });
    }

    if (!process.env.BC_STORE_HASH || !process.env.BC_API_TOKEN) {
      console.error("[Custom Stripe] Missing BC_STORE_HASH or BC_API_TOKEN");
      return res.status(500).json({
        error: "BigCommerce API is not configured on the server",
      });
    }

    // 1) Verify the PaymentIntent really succeeded
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      console.error("[Custom Stripe] PaymentIntent not succeeded:", pi.id, pi.status);
      return res.status(400).json({ error: "Payment not completed" });
    }

    // 2) If we don't have checkoutId, recover it from the order (cart_id)
    let effectiveCheckoutId = checkoutId;
    if (!effectiveCheckoutId) {
      const orderResp = await fetch(
        `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}/v2/orders/${orderId}`,
        {
          method: "GET",
          headers: {
            "X-Auth-Token": process.env.BC_API_TOKEN,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      if (!orderResp.ok) {
        const text = await orderResp.text();
        console.error(
          "[Custom Stripe] fetch order for checkoutId failed",
          orderResp.status,
          text
        );
        throw new Error("Failed to fetch order to determine checkoutId");
      }

      const bcOrder = await orderResp.json();
      effectiveCheckoutId = bcOrder.cart_id;
    }

    if (!effectiveCheckoutId) {
      throw new Error("No checkoutId available to create checkout token");
    }

    // 3) Create checkout token for order-confirmation redirect
    const tokenResp = await fetch(
      `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}/v3/checkouts/${effectiveCheckoutId}/token`,
      {
        method: "POST",
        headers: {
          "X-Auth-Token": process.env.BC_API_TOKEN,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      console.error(
        "[Custom Stripe] create checkout token failed",
        tokenResp.status,
        text
      );
      throw new Error("Failed to create checkout token in BigCommerce");
    }

    const tokenJson = await tokenResp.json();
    const checkoutToken = tokenJson.data?.token;
    if (!checkoutToken) {
      throw new Error("BigCommerce did not return a checkout token");
    }

    // 4) Update the order status to indicate payment collected
    //   2 = Awaiting Fulfillment 
    const updateResp = await fetch(
      `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}/v2/orders/${orderId}`,
      {
        method: "PUT",
        headers: {
          "X-Auth-Token": process.env.BC_API_TOKEN,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status_id: 2, 
        }),
      }
    );

    if (!updateResp.ok) {
      const text = await updateResp.text();
      console.error(
        "[Custom Stripe] update order status failed",
        updateResp.status,
        text
      );
      throw new Error("Failed to update order status in BigCommerce");
    }

    // 5) Build redirect URL for order confirmation
    const storeUrl =
      process.env.BC_STORE_URL ||
      "https://france-1742885.mybigcommerce.com";

    const redirectUrl = `${storeUrl}/checkout/order-confirmation/${orderId}?t=${encodeURIComponent(
      checkoutToken
    )}`;

    res.json({ redirectUrl });
  } catch (error: any) {
    console.error("[Custom Stripe] payment confirm error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
});

app.listen(port, () => {
  console.log(`Custom payment app listening on port ${port}`);
});
