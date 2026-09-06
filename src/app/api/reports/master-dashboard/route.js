import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || '2026-01-01';
  const endDate = searchParams.get('endDate') || '2026-12-31';

  try {
    const supabase = createServerClient();

    if (supabase) {

      // ─── 1. Query Payments from gold.fact_master_dashboard_payments ────────────────
      const { data: payRows, error: payErr } = await supabase
        .schema('gold')
        .from('fact_master_dashboard_payments')
        .select('*')
        .gte('full_date', startDate)
        .lte('full_date', endDate);

      let upiSum = 0, cashSum = 0, cardSum = 0, otherSum = 0, totalSalesSum = 0;
      let paymentTrend = [];

      if (payRows && payRows.length > 0) {
        payRows.forEach(r => {
          const upi = Number(r.upi_amount || 0);
          const cash = Number(r.cash_amount || 0);
          const card = Number(r.card_amount || 0);
          const other = Number(r.other_amount || 0);
          const tot = Number(r.total_sales || 0) || (upi + cash + card + other);

          upiSum += upi;
          cashSum += cash;
          cardSum += card;
          otherSum += other;
          totalSalesSum += tot;

          paymentTrend.push({
            date: r.full_date,
            upi,
            cash,
            card,
            other
          });
        });
      }

      let upiPct = totalSalesSum > 0 ? Number(((upiSum / totalSalesSum) * 100).toFixed(2)) : 0;
      let cashPct = totalSalesSum > 0 ? Number(((cashSum / totalSalesSum) * 100).toFixed(2)) : 0;
      let cardPct = totalSalesSum > 0 ? Number(((cardSum / totalSalesSum) * 100).toFixed(2)) : 0;
      let otherPct = totalSalesSum > 0 ? Number(((otherSum / totalSalesSum) * 100).toFixed(2)) : 0;

      // ─── 2. Query Sales Summary from gold.fact_master_dashboard ─────────────────────
      const { data: sumRows } = await supabase
        .schema('gold')
        .from('fact_master_dashboard')
        .select('*')
        .gte('full_date', startDate)
        .lte('full_date', endDate);

      let totalRsv = 0, totalMrp = 0, totalQty = 0, totalBills = 0;
      let divisionMap = {};

      if (sumRows && sumRows.length > 0) {
        sumRows.forEach(r => {
          totalRsv += Number(r.rsv || 0);
          totalMrp += Number(r.mrp || 0);
          totalQty += Number(r.qty || 0);
          totalBills += Number(r.bills_count || 0);

          const div = r.division || 'Reebok';
          if (!divisionMap[div]) divisionMap[div] = { rsv: 0, qty: 0 };
          divisionMap[div].rsv += Number(r.rsv || 0);
          divisionMap[div].qty += Number(r.qty || 0);
        });
      }

      const daysCount = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1);
      const avgPerDay = Number((totalRsv / daysCount).toFixed(2));
      const mdPct = totalMrp > 0 ? Number((((totalMrp - totalRsv) / totalMrp) * 100).toFixed(2)) : 0;
      const atv = totalBills > 0 ? Number((totalRsv / totalBills).toFixed(2)) : 0;

      const divisionSplit = Object.keys(divisionMap).map(k => ({
        division: k,
        rsv: divisionMap[k].rsv,
        qty: divisionMap[k].qty
      }));

      const topStores = totalRsv > 0 ? [{ store_name: 'Reebok Uppal', site_short_name: 'R1157', rsv: totalRsv, qty: totalQty }] : [];
      const storePerformance = totalRsv > 0 ? [{ store_name: 'Reebok Uppal', site_short_name: 'R1157', rsv: totalRsv, bills: totalBills, qty_sold: totalQty, md_pct: mdPct }] : [];

      return NextResponse.json({
        success: true,
        summary: {
          kpis: { rsv: totalRsv, avgPerDay, mdPct, qtySold: totalQty, bills: totalBills, atv, daysCount },
          dailyTrend: [],
          divisionSplit,
          topStores,
          storePerformance,
        },
        payments: {
          totals: {
            totalSales: totalSalesSum,
            upiAmount: upiSum,
            upiPct,
            cashAmount: cashSum,
            cashPct,
            cardAmount: cardSum,
            cardPct,
            otherAmount: otherSum,
            otherPct,
          },
          paymentTrend,
          storePayments: totalSalesSum > 0 ? [{ store_number: 'R1157', total_sales: totalSalesSum, upi_amount: upiSum, cash_amount: cashSum, card_amount: cardSum, other_amount: otherSum }] : [],
        },
      });
    }
  } catch (err) {
    console.error('Master Dashboard API error:', err);
  }

  return NextResponse.json({
    success: true,
    summary: {
      kpis: { rsv: 0, avgPerDay: 0, mdPct: 0, qtySold: 0, bills: 0, atv: 0, daysCount: 1 },
      dailyTrend: [],
      divisionSplit: [],
      topStores: [],
      storePerformance: [],
    },
    payments: {
      totals: { totalSales: 0, upiAmount: 0, upiPct: 0, cashAmount: 0, cashPct: 0, cardAmount: 0, cardPct: 0, otherAmount: 0, otherPct: 0 },
      paymentTrend: [],
      storePayments: [],
    },
  });
}
