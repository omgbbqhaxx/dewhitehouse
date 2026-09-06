// wh.gov'daki kucuk kartal-bayrak logosunun yerine sade bir kolonlu bina muhru.
export default function Seal({ size = 40, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 100 62" fill="none" aria-hidden="true">
      <polygon points="50,2 8,20 92,20" fill={color} />
      <rect x="12" y="22" width="76" height="3" fill={color} />
      {[16, 28, 40, 52, 64, 76].map((x) => (
        <rect key={x} x={x} y="27" width="8" height="24" fill={color} />
      ))}
      <rect x="10" y="53" width="80" height="3" fill={color} />
      <rect x="6" y="58" width="88" height="3" fill={color} />
    </svg>
  );
}
