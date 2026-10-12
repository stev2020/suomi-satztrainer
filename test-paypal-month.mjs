// Monatssummen aus PayPal-Daten: nur Eingänge in Euro, Erstattungen abgezogen, Berliner Monatsgrenzen.
import assert from 'node:assert/strict';
const {summarize,monthStart,berlinMonth}=await import('./supabase/functions/_shared/paypal-month.ts');
const t=(code,value,fee='0',cur='EUR',date='2026-10-05T10:00:00+0000',status='S')=>({transaction_event_code:code,transaction_status:status,transaction_initiation_date:date,
  transaction_amount:{currency_code:cur,value},fee_amount:{currency_code:cur,value:fee}});
const s=summarize([t('T0013','5.00','-0.45'),t('T0002','1.00','-0.37','EUR','2026-10-09T08:00:00+0000'),t('T0006','10.00','-0.60'),
  t('T1107','-5.00','0.45'),t('T0400','-12.00'),t('T0006','7.00','-0.5','USD'),t('T0006','3.00','-0.2','EUR','2026-10-10T00:00:00+0000','P')]);
assert.equal(s.gross,11);assert.equal(s.payments,3);assert.equal(s.recurring,1);assert.equal(s.fees,0.97);
assert.equal(s.last_payment_at,'2026-10-09T08:00:00+0000');
assert.deepEqual(summarize([]),{gross:0,fees:0,payments:0,recurring:0,last_payment_at:null});
assert.equal(monthStart(2026,10),'2026-10-01T00:00:00+02:00');
assert.equal(monthStart(2026,11),'2026-11-01T00:00:00+01:00');
assert.equal(monthStart(2026,13),'2027-01-01T00:00:00+01:00');
assert.equal(monthStart(2026,-4),'2025-08-01T00:00:00+02:00');
assert.deepEqual(berlinMonth(new Date('2026-10-31T23:30:00Z')),{year:2026,month:11});
console.log('PASS: PayPal-Monatssummen (Eingänge, Erstattungen, Gebühren, Euro, Berliner Monatsgrenzen).');
