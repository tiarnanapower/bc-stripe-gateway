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

      // TODO: inject payment method
    });
  `;

  res.type('application/javascript').send(js);
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Custom payment app listening on port ${port}`);
});
//8.29.230.139
