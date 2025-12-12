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

      // TODO: inject payment method
    });
  `;
    res.type('application/javascript').send(js);
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Custom payment app listening on port ${port}`);
});

