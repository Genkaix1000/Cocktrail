export default function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pointsData = (!data || data.length < 2) ? [10, 15, 8, 20, 12, 18] : data;
  const max = Math.max(...pointsData, 1);
  const min = Math.min(...pointsData, 0);
  const range = max - min || 1;
  const width = 140;
  const height = 24;
  const points = pointsData.map((val, idx) => {
    const x = (idx / (pointsData.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });
  const pathData = `M ${points.join(" L ")}`;
  const gradId = `spark-grad-${Math.floor(Math.random() * 1000000)}`;

  return (
    <svg className="w-full h-8 overflow-visible mt-2 block opacity-85" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${pathData} L ${width},${height} L 0,${height} Z`}
        fill={`url(#${gradId})`}
      />
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
