import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { ForecastsTable } from './forecasts-table';
import { computeCropPlanDeadline } from '@/lib/crop-plan-deadline';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Crop Plan Forecasts - Admin Dashboard',
  description: 'View all farmer crop plans to forecast demand by crop, acreage, and season.',
};

export interface ForecastPlan {
  id: number;
  plan_name: string;
  crop: string;
  plan_year: number;
  total_acres: string;
  total_cost: string | null;
  cost_per_acre: string | null;
  status: string;
  ai_generated: boolean;
  weed_pressure: string | null;
  target_weeds: string[] | null;
  created_at: string;
  farmer_name: string;
  farmer_email: string;
  pass_count: number;
  farmer_zip: string | null;
  order_by_date: string | null;
  urgency: 'asap' | 'soon' | 'normal' | 'ahead' | null;
  earliest_target_date: string | null;
}

interface RawForecastPlan extends Omit<ForecastPlan, 'order_by_date' | 'urgency' | 'earliest_target_date'> {
  passes_json: Array<{ name: string; timing_label: string | null }>;
}

async function getForecastPlans(): Promise<ForecastPlan[]> {
  try {
    const rawPlans = await query<RawForecastPlan>(
      `SELECT
         p.id,
         p.plan_name,
         p.crop,
         p.plan_year,
         p.total_acres,
         p.total_cost,
         p.cost_per_acre,
         p.status,
         p.ai_generated,
         p.weed_pressure,
         p.target_weeds,
         p.created_at,
         u.name  AS farmer_name,
         u.email AS farmer_email,
         COUNT(DISTINCT pp.id)::int AS pass_count,
         fp.zip_code AS farmer_zip,
         COALESCE(
           json_agg(
             json_build_object('name', pp.name, 'timing_label', pp.timing_label)
             ORDER BY pp.sort_order
           ) FILTER (WHERE pp.id IS NOT NULL),
           '[]'
         ) AS passes_json
       FROM farmer_crop_plans p
       JOIN "user" u ON u.id = p.user_id
       LEFT JOIN farm_profiles fp ON fp.user_id = p.user_id
       LEFT JOIN farmer_plan_passes pp ON pp.plan_id = p.id
       GROUP BY p.id, u.name, u.email, fp.zip_code
       ORDER BY p.plan_year DESC, p.created_at DESC`
    );

    return rawPlans.map((p) => {
      if (!p.farmer_zip || !p.passes_json?.length) {
        return { ...p, order_by_date: null, urgency: null, earliest_target_date: null };
      }
      try {
        const deadline = computeCropPlanDeadline(p.farmer_zip, p.crop, p.passes_json, p.plan_year);
        return {
          ...p,
          order_by_date: deadline.orderByDate,
          urgency: deadline.urgency,
          earliest_target_date: deadline.earliestTargetDate,
        };
      } catch {
        return { ...p, order_by_date: null, urgency: null, earliest_target_date: null };
      }
    });
  } catch (error) {
    console.error('Error fetching forecast plans:', error);
    return [];
  }
}

export default async function ForecastsPage() {
  const session = await getAdminSession();

  if (!session?.permissions.includes('acrepack.view')) {
    redirect('/admin');
  }

  const plans = await getForecastPlans();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Crop Plan Forecasts</h1>
        <p className="mt-1 text-slate-500">
          All farmer crop plans — use this to forecast demand by crop, acreage, and season.
        </p>
      </div>

      <ForecastsTable plans={plans} />
    </div>
  );
}
