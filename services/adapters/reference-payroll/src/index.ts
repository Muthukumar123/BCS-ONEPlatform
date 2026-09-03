import express from 'express';
import pino from 'pino';
import { z } from 'zod';

const app = express();
const log = pino({ name: 'reference-payroll-adapter' });
const port = Number(process.env.PORT ?? 3003);

const RequestSchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/)
}).strict();

app.use(express.json({ limit: '64kb' }));
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'reference-payroll-adapter' }));

app.post('/capabilities/payroll.employee_summary', (req, res) => {
  const tenantId = req.header('x-bcs-tenant-id');
  if (!tenantId) return res.status(403).json({ code: 'TENANT_CONTEXT_REQUIRED' });

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR' });

  // Synthetic reference data only. Never connect this adapter to real BCS data without a reviewed mapping and contract tests.
  const seed = [...`${tenantId}:${parsed.data.employeeId}:${parsed.data.period}`]
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const grossAmount = 3200 + (seed % 700);
  const pension = Number((grossAmount * 0.055).toFixed(2));
  const tax = Number((grossAmount * 0.245).toFixed(2));
  const netAmount = Number((grossAmount - pension - tax).toFixed(2));

  res.json({
    employeeId: parsed.data.employeeId,
    period: parsed.data.period,
    grossAmount,
    netAmount,
    currency: 'EUR',
    lineItems: [
      { code: 'GROSS', amount: grossAmount },
      { code: 'PENSION', amount: -pension },
      { code: 'TAX', amount: -tax }
    ],
    sourceSystem: 'synthetic-reference-payroll',
    freshness: new Date().toISOString()
  });
});

app.listen(port, () => log.info({ port }, 'reference payroll adapter listening'));
