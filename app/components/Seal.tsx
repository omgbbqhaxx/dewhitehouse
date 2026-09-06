// Sade, resmi bir muhur. Gercek bir kurumun ambleminin kopyasi degildir.
export default function Seal({ size = 56, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="47" stroke={color} strokeWidth="2" />
      <circle cx="50" cy="50" r="41" stroke={color} strokeWidth="0.75" />
      {Array.from({ length: 13 }).map((_, i) => {
        const a = (i / 13) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(a) * 36;
        const y = 50 + Math.sin(a) * 36;
        return <circle key={i} cx={x} cy={y} r="1.4" fill={color} />;
      })}
      {/* Kolonlu bina silueti */}
      <rect x="30" y="58" width="40" height="3" fill={color} />
      <rect x="27" y="61" width="46" height="2.5" fill={color} />
      <polygon points="50,34 26,46 74,46" fill={color} />
      <rect x="31" y="46" width="38" height="2" fill={color} />
      {[34, 41, 48, 55, 62].map((x) => (
        <rect key={x} x={x} y="49" width="3.5" height="9" fill={color} />
      ))}
    </svg>
  );
}
