import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

/**
 * POST /api/pnl/ingest
 * Ingest monthly P&L data into the database
 */
export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const { monthlyData } = await request.json();

    if (!monthlyData || !Array.isArray(monthlyData)) {
      return NextResponse.json(
        { error: 'monthlyData must be an array' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const results = {
      successful: 0,
      failed: 0,
      errors: [],
      created: [],
      updated: [],
    };

    // Get store ID for Uppal
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id')
      .eq('name', 'REEBOK UPPAL')
      .single();

    if (storeErr || !store) {
      return NextResponse.json(
        { error: 'Store "REEBOK UPPAL" not found' },
        { status: 404 }
      );
    }

    // Get all expense categories
    const { data: categories, error: catErr } = await supabase
      .from('expense_categories')
      .select('id, name');

    if (catErr || !categories) {
      return NextResponse.json(
        { error: 'Failed to load expense categories' },
        { status: 500 }
      );
    }

    const categoryMap = Object.fromEntries(
      categories.map((c) => [c.name, c.id])
    );

    // Ingest each month's data
    for (const month of monthlyData) {
      try {
        const { periodMonth, grossSale, incomeMargin, depreciation, fundsCost, roi, expenses } = month;

        if (!periodMonth) {
          results.errors.push(`Missing period_month`);
          results.failed++;
          continue;
        }

        // Upsert monthly P&L record
        const { data: pnlRecord, error: pnlErr } = await supabase
          .from('monthly_pnl')
          .upsert(
            {
              store_id: store.id,
              period_month: periodMonth,
              gross_sale: grossSale || 0,
              income_margin: incomeMargin || 0,
              depreciation: depreciation || 0,
              funds_cost: fundsCost || 0,
              roi: roi || 0,
              import_source: 'excel',
              import_date: new Date().toISOString(),
            },
            { onConflict: 'store_id,period_month' }
          )
          .select('id')
          .single();

        if (pnlErr || !pnlRecord) {
          results.errors.push(`Failed to upsert P&L for ${periodMonth}: ${pnlErr?.message}`);
          results.failed++;
          continue;
        }

        // Upsert expense line items
        if (expenses && typeof expenses === 'object') {
          for (const [categoryName, amount] of Object.entries(expenses)) {
            const categoryId = categoryMap[categoryName];
            if (!categoryId) {
              results.errors.push(`Unknown expense category: ${categoryName}`);
              continue;
            }

            const { error: expenseErr } = await supabase
              .from('monthly_expense_lines')
              .upsert(
                {
                  monthly_pnl_id: pnlRecord.id,
                  category_id: categoryId,
                  amount: amount || 0,
                },
                { onConflict: 'monthly_pnl_id,category_id' }
              );

            if (expenseErr) {
              results.errors.push(
                `Failed to upsert expense ${categoryName}: ${expenseErr.message}`
              );
            }
          }
        }

        results.successful++;
        results.created.push(periodMonth);
      } catch (err) {
        results.errors.push(`Error processing month: ${err.message}`);
        results.failed++;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('[PNL-INGEST]', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pnl/ingest
 * Fetch all P&L data for the store
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const storeCode = searchParams.get('storeCode') || '323865';

    // Fetch all P&L data for this store
    const { data, error } = await supabase
      .from('monthly_pnl_totals')
      .select('*')
      .eq('store_code', storeCode)
      .order('period_month', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, total: data.length });
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
