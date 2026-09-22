import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear(); // e.g. 2026

  const month = parseInt(searchParams.get('month') || currentMonth.toString(), 10);
  const year = parseInt(searchParams.get('year') || currentYear.toString(), 10);
  const reportType = searchParams.get('reportType') || 'sales'; // 'sales', 'account_dsr', 'inventory', 'raw'

  try {
    const supabase = createServerClient();

    // Format start and end date strings for the requested month
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // 1. Fetch Calendar Days for Month from staging.dim_date
    let dimDays = [];
    const { data: dimData } = await supabase
      .schema('staging')
      .from('dim_date')
      .select('full_date, day, day_of_week, month_name, year, is_weekend, is_holiday')
      .gte('full_date', startDateStr)
      .lte('full_date', endDateStr)
      .order('day', { ascending: true });

    if (dimData && dimData.length > 0) {
      dimDays = dimData;
    } else {
      // Fallback generator if dim_date table is not pre-populated for this month
      for (let d = 1; d <= lastDayOfMonth; d++) {
        const dObj = new Date(year, month - 1, d);
        const dayIso = dObj.toISOString().split('T')[0];
        const dayOfWeekNum = dObj.getDay(); // 0 = Sun, 6 = Sat
        dimDays.push({
          full_date: dayIso,
          day: d,
          day_of_week: dayOfWeekNum === 0 ? 7 : dayOfWeekNum,
          month_name: dObj.toLocaleString('en-US', { month: 'long' }),
          year,
          is_weekend: dayOfWeekNum === 0 || dayOfWeekNum === 6,
          is_holiday: false,
        });
      }
    }

    // 2. Fetch Holiday Names from staging.holiday_reference
    const holidayMap = {};
    const { data: holidayData } = await supabase
      .schema('staging')
      .from('holiday_reference')
      .select('full_date, holiday_name')
      .gte('full_date', startDateStr)
      .lte('full_date', endDateStr);

    if (holidayData) {
      holidayData.forEach((h) => {
        holidayMap[h.full_date] = h.holiday_name;
      });
    }

    // 3. Set of dates having uploaded data
    const hasDataDatesSet = new Set();

    // Helper to normalize various date formats (DD-MM-YYYY, YYYY-MM-DD HH:mm:ss, ISO strings) to YYYY-MM-DD
    const normalizeDateStr = (rawDateStr) => {
      if (!rawDateStr) return null;
      const str = String(rawDateStr).trim();
      if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
        const parts = str.split(' ')[0].split('-');
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return str.substring(0, 10);
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
      return null;
    };

    // A. Query Sales Data
    if (reportType === 'sales' || reportType === 'raw' || reportType === 'all') {
      const { data: goldSales } = await supabase
        .schema('gold')
        .from('fact_master_dashboard')
        .select('full_date')
        .gte('full_date', startDateStr)
        .lte('full_date', endDateStr);

      if (goldSales && goldSales.length > 0) {
        goldSales.forEach((r) => {
          const norm = r.full_date ? String(r.full_date).substring(0, 10) : null;
          if (norm) hasDataDatesSet.add(norm);
        });
      }

      const { data: rawSales } = await supabase
        .schema('raw')
        .from('sales')
        .select('"Bill Date"')
        .limit(2000);

      if (rawSales && rawSales.length > 0) {
        rawSales.forEach((r) => {
          const norm = normalizeDateStr(r['Bill Date']);
          if (norm && norm >= startDateStr && norm <= endDateStr) {
            hasDataDatesSet.add(norm);
          }
        });
      }
    }

    // B. Query Account DSR Data
    if (reportType === 'account_dsr' || reportType === 'raw' || reportType === 'all') {
      const { data: goldPayments } = await supabase
        .schema('gold')
        .from('fact_master_dashboard_payments')
        .select('full_date')
        .gte('full_date', startDateStr)
        .lte('full_date', endDateStr);

      if (goldPayments && goldPayments.length > 0) {
        goldPayments.forEach((r) => {
          const norm = r.full_date ? String(r.full_date).substring(0, 10) : null;
          if (norm) hasDataDatesSet.add(norm);
        });
      }

      const { data: rawDsr } = await supabase
        .schema('raw')
        .from('account_dsr')
        .select('Date')
        .limit(2000);

      if (rawDsr && rawDsr.length > 0) {
        rawDsr.forEach((r) => {
          const norm = normalizeDateStr(r.Date);
          if (norm && norm >= startDateStr && norm <= endDateStr) {
            hasDataDatesSet.add(norm);
          }
        });
      }
    }

    // C. Query Stock / Inventory Data
    if (reportType === 'inventory' || reportType === 'stock' || reportType === 'raw' || reportType === 'all') {
      const { data: rawInv } = await supabase
        .schema('raw')
        .from('inventory')
        .select('uploaded_at')
        .limit(2000);

      if (rawInv && rawInv.length > 0) {
        rawInv.forEach((r) => {
          const norm = normalizeDateStr(r.uploaded_at);
          if (norm && norm >= startDateStr && norm <= endDateStr) {
            hasDataDatesSet.add(norm);
          }
        });
      }
    }

    // D. Query upload_audit_log for matching report records
    let auditTypeFilter = reportType;
    if (reportType === 'stock') auditTypeFilter = 'inventory';

    let auditQuery = supabase
      .from('upload_audit_log')
      .select('uploaded_at, status, report_type')
      .in('status', ['completed', 'success', 'uploaded']);

    if (auditTypeFilter !== 'raw' && auditTypeFilter !== 'all') {
      auditQuery = auditQuery.eq('report_type', auditTypeFilter);
    }

    const { data: auditData } = await auditQuery;
    if (auditData && auditData.length > 0) {
      auditData.forEach((r) => {
        const norm = normalizeDateStr(r.uploaded_at);
        if (norm && norm >= startDateStr && norm <= endDateStr) {
          hasDataDatesSet.add(norm);
        }
      });
    }

    // 4. Determine Cutoff Today Date for Missing vs Future
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Find latest data date overall
    let latestDataDate = null;
    if (hasDataDatesSet.size > 0) {
      const sortedDates = Array.from(hasDataDatesSet).sort();
      latestDataDate = sortedDates[sortedDates.length - 1];
    } else {
      latestDataDate = todayStr;
    }

    // 5. Build Days Coverage Array & Calculate KPIs
    let daysWithDataCount = 0;
    let missingCount = 0;
    let elapsedDaysCount = 0;

    const daysGrid = dimDays.map((d) => {
      const isHasData = hasDataDatesSet.has(d.full_date);
      const isPastOrToday = d.full_date <= todayStr;
      
      let status = 'future';
      if (isHasData && isPastOrToday) {
        status = 'has_data';
        daysWithDataCount++;
      } else if (isHasData && !isPastOrToday) {
        // Data exists for a future date — show it visually but don't count toward coverage %
        status = 'has_data';
      } else if (isPastOrToday) {
        status = 'missing';
        missingCount++;
      }

      if (isPastOrToday) {
        elapsedDaysCount++;
      }

      const initials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      const dayInitial = initials[(d.day_of_week - 1) % 7] || 'D';

      return {
        date: d.full_date,
        dayNumber: d.day,
        dayInitial,
        status, // 'has_data' | 'missing' | 'future'
        isWeekend: d.is_weekend,
        isToday: d.full_date === todayStr,
        isHoliday: d.is_holiday || !!holidayMap[d.full_date],
        holidayName: holidayMap[d.full_date] || null,
      };
    });

    const coveragePct = elapsedDaysCount > 0
      ? Number(((daysWithDataCount / elapsedDaysCount) * 100).toFixed(1))
      : 0;

    const storeCoverage = [
      {
        manager: 'STORE MANAGER',
        storeName: 'UPPAL-HYDERABAD',
        storeCode: 'R1157',
        gapsCount: missingCount,
        days: daysGrid,
      },
    ];

    let latestDataFormatted = 'N/A';
    if (latestDataDate) {
      const lObj = new Date(latestDataDate);
      if (!isNaN(lObj.getTime())) {
        latestDataFormatted = lObj.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }

    return NextResponse.json({
      success: true,
      month,
      year,
      monthName: dimDays[0]?.month_name || new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' }),
      latestDataDate: latestDataFormatted,
      kpis: {
        totalStores: 1,
        coveragePct,
        daysWithData: daysWithDataCount,
        missingDays: missingCount,
      },
      stores: storeCoverage,
    });
  } catch (error) {
    console.error('Upload Coverage API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
