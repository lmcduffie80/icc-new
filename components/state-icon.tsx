import { US_STATE_NAMES } from '@/lib/constants/states';
import fs from 'fs';
import path from 'path';

interface StateIconProps {
  stateCode: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

// Bounding boxes for each state (minX, minY, width, height) with padding
const STATE_VIEWBOXES: Record<string, string> = {
  AL: '940 400 100 150',
  AK: '150 440 260 180',
  AZ: '330 320 150 170',
  AR: '760 360 120 120',
  CA: '240 130 160 300',
  CO: '460 260 140 120',
  CT: '1095 165 50 50',
  DE: '1070 245 40 60',
  DC: '1050 260 30 30',
  FL: '950 450 150 160',
  GA: '955 345 115 145',
  HI: '410 510 140 110',
  ID: '330 80 120 200',
  IL: '820 230 90 170',
  IN: '860 240 80 130',
  IA: '730 200 130 110',
  KS: '600 290 160 100',
  KY: '860 300 140 90',
  LA: '780 440 120 120',
  ME: '1100 60 80 120',
  MD: '1010 240 90 70',
  MA: '1080 145 75 50',
  MI: '830 120 120 160',
  MN: '710 80 130 160',
  MS: '850 390 80 140',
  MO: '740 280 130 140',
  MT: '360 50 200 130',
  NE: '550 210 170 100',
  NV: '280 160 120 200',
  NH: '1100 100 45 90',
  NJ: '1075 200 45 80',
  NM: '430 320 150 160',
  NY: '1000 110 120 130',
  NC: '960 320 150 90',
  ND: '560 70 150 100',
  OH: '900 220 90 120',
  OK: '600 350 170 110',
  OR: '230 80 160 130',
  PA: '990 190 110 80',
  RI: '1110 170 35 40',
  SC: '980 360 100 90',
  SD: '560 130 150 110',
  TN: '850 340 160 70',
  TX: '520 360 290 250',
  UT: '370 200 110 160',
  VT: '1090 95 45 80',
  VA: '980 260 130 90',
  WA: '250 30 150 110',
  WV: '960 250 80 100',
  WI: '780 120 110 140',
  WY: '440 160 140 120',
};

const sizeClasses = {
  sm: 'w-24 h-24',
  md: 'w-40 h-40',
  lg: 'w-56 h-56',
};

export function StateIcon({
  stateCode,
  size = 'md',
  showLabel = true,
  className = ''
}: StateIconProps) {
  const normalizedCode = stateCode?.toUpperCase().trim();
  const stateName = US_STATE_NAMES[normalizedCode] || normalizedCode;

  // Read the SVG file
  let svgPath: string | null = null;
  try {
    const filePath = path.join(process.cwd(), 'public', 'states', `${normalizedCode}.svg`);
    const svgContent = fs.readFileSync(filePath, 'utf-8');
    // Extract the path d attribute
    const pathMatch = svgContent.match(/d="([^"]+)"/);
    if (pathMatch) {
      svgPath = pathMatch[1];
    }
  } catch {
    // File not found or error reading
  }

  const viewBox = STATE_VIEWBOXES[normalizedCode] || '192 9 1028 746';

  if (!svgPath) {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <div className={`${sizeClasses[size]} flex items-center justify-center bg-slate-100 rounded-lg`}>
          <span className="text-2xl font-bold text-slate-400">{normalizedCode}</span>
        </div>
        {showLabel && (
          <span className="text-sm font-medium text-slate-700">{stateName}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className={sizeClasses[size]}>
        <svg
          viewBox={viewBox}
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>{stateName}</title>
          <path
            d={svgPath}
            className="fill-primary"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showLabel && (
        <span className="text-base font-semibold text-slate-700">{stateName}</span>
      )}
    </div>
  );
}
