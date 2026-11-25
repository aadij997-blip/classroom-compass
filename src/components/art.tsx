// Code-native concept illustrations in the rounded, friendly style of the
// illustrated Day 1 lesson. These are original drawings, not crops of the PDF
// artwork (which is flattened and not supplied as separate files).

import type { ConceptId } from "@/lib/domain/types";

const C = {
  ink: "#1a1f14",
  forest: "#14532d",
  lime: "#93d12e",
  pale: "#e7f3c4",
  blush: "#ffe3de",
  peach: "#f4b4a4",
  terracotta: "#8f3b2e",
  coin: "#f4c542",
  coinDark: "#d99a1c",
  white: "#ffffff",
};

function Coin({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y + 2} r={r} fill={C.coinDark} />
      <circle cx={x} cy={y} r={r} fill={C.coin} stroke={C.coinDark} strokeWidth="1.5" />
      <text x={x} y={y + r * 0.42} textAnchor="middle" fontSize={r * 1.15} fontWeight="700" fill={C.coinDark} fontFamily="Outfit, sans-serif">$</text>
    </g>
  );
}

function Sparks({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={C.coin} strokeWidth="3" strokeLinecap="round">
      <path d={`M${x} ${y}l-5 -7`} />
      <path d={`M${x + 9} ${y - 3}l0 -9`} />
      <path d={`M${x + 18} ${y}l5 -7`} />
    </g>
  );
}

export function ChoiceCardsArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-label="Three choice cards: one chosen, one next-best, one further option">
      <path d="M100 136 C100 112 100 104 100 96 M100 112 C80 104 58 100 44 88 M100 112 C120 104 142 100 156 88" stroke={C.forest} strokeOpacity=".35" strokeWidth="3" strokeDasharray="5 6" fill="none" strokeLinecap="round" />
      <g transform="rotate(-8 44 54)">
        <rect x="16" y="20" width="56" height="70" rx="14" fill={C.white} stroke={C.forest} strokeWidth="2.5" />
        <rect x="24" y="30" width="40" height="26" rx="8" fill={C.pale} />
        <path d="M34 44l6 6 12-12" stroke={C.forest} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="26" y="64" width="34" height="6" rx="3" fill={C.forest} fillOpacity=".25" />
        <rect x="26" y="75" width="22" height="6" rx="3" fill={C.forest} fillOpacity=".15" />
      </g>
      <g>
        <rect x="72" y="14" width="56" height="70" rx="14" fill={C.blush} stroke={C.terracotta} strokeWidth="2.5" />
        <text x="100" y="52" textAnchor="middle" fontSize="26" fontWeight="700" fill={C.terracotta} fontFamily="Outfit, sans-serif">2nd</text>
        <rect x="84" y="62" width="32" height="6" rx="3" fill={C.terracotta} fillOpacity=".3" />
      </g>
      <g transform="rotate(8 156 54)" opacity=".7">
        <rect x="128" y="20" width="56" height="70" rx="14" fill={C.white} stroke={C.ink} strokeOpacity=".3" strokeWidth="2.5" />
        <text x="156" y="58" textAnchor="middle" fontSize="22" fontWeight="700" fill={C.ink} fillOpacity=".35" fontFamily="Outfit, sans-serif">3rd</text>
      </g>
      <Coin x={100} y={128} r={11} />
      <Sparks x={91} y={9} />
    </svg>
  );
}

export function BasketsArt({ className }: { className?: string }) {
  const basket = (x: number, w: number, fill: string, stroke: string) => (
    <g>
      <path d={`M${x} 96 h${w} l-7 38 a6 6 0 0 1 -6 5 h${-(w - 26)} a6 6 0 0 1 -6 -5 z`} fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      <path d={`M${x + 8} 108 h${w - 16} M${x + 10} 120 h${w - 20}`} stroke={stroke} strokeOpacity=".35" strokeWidth="2" />
    </g>
  );
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-label="One basket holding every token beside several smaller baskets holding different tokens">
      {basket(8, 76, C.blush, C.terracotta)}
      {[0, 1, 2, 3].map((i) => <Coin key={`a${i}`} x={30 + (i % 2) * 22} y={86 - Math.floor(i / 2) * 16} r={10} />)}
      <Coin x={41} y={56} r={10} />
      <rect x="14" y="22" width="58" height="18" rx="9" fill={C.white} stroke={C.terracotta} strokeWidth="2" />
      <text x="43" y="35" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.terracotta} fontFamily="Outfit, sans-serif">one kind</text>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          {basket(100 + i * 33, 30, i === 1 ? C.pale : C.white, C.forest)}
          <Coin x={115 + i * 33} y={86} r={8} />
          <rect x={103 + i * 33} y={60} width="24" height="12" rx="6" fill={[C.pale, C.blush, C.coin][i]} stroke={C.forest} strokeOpacity=".5" strokeWidth="1.5" />
        </g>
      ))}
      <Sparks x={138} y={40} />
    </svg>
  );
}

export function CashTraysArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-label="Two trays: money available today and investments available later">
      <rect x="8" y="34" width="88" height="96" rx="20" fill={C.white} stroke={C.forest} strokeWidth="2.5" />
      <rect x="20" y="22" width="64" height="20" rx="10" fill={C.pale} stroke={C.forest} strokeWidth="2" />
      <text x="52" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.forest} fontFamily="Outfit, sans-serif">today</text>
      <rect x="22" y="62" width="60" height="32" rx="7" fill={C.lime} stroke={C.forest} strokeWidth="2.5" />
      <circle cx="52" cy="78" r="8" fill="none" stroke={C.forest} strokeWidth="2.5" />
      <Coin x={36} y={110} r={9} />
      <Coin x={58} y={112} r={9} />
      <rect x="104" y="34" width="88" height="96" rx="20" fill={C.blush} stroke={C.terracotta} strokeWidth="2.5" />
      <rect x="116" y="22" width="64" height="20" rx="10" fill={C.white} stroke={C.terracotta} strokeWidth="2" />
      <text x="148" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.terracotta} fontFamily="Outfit, sans-serif">later</text>
      <rect x="118" y="58" width="40" height="40" rx="9" fill={C.white} stroke={C.terracotta} strokeWidth="2.5" />
      <path d="M125 88l8-10 7 5 11-13" stroke={C.forest} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="168" cy="106" r="13" fill={C.white} stroke={C.terracotta} strokeWidth="2.5" />
      <path d="M168 99v8l5 3" stroke={C.terracotta} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ChecklistArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="A clipboard checklist">
      <rect x="22" y="16" width="72" height="92" rx="14" fill={C.white} stroke={C.forest} strokeWidth="2.5" />
      <rect x="42" y="8" width="32" height="16" rx="7" fill={C.pale} stroke={C.forest} strokeWidth="2" />
      {[40, 62, 84].map((y, i) => (
        <g key={y}>
          <rect x="34" y={y - 8} width="14" height="14" rx="4" fill={i < 2 ? C.lime : C.white} stroke={C.forest} strokeWidth="2" />
          {i < 2 && <path d={`M37 ${y - 1}l3 3 6-7`} stroke={C.forest} strokeWidth="2.5" fill="none" strokeLinecap="round" />}
          <rect x="54" y={y - 4} width="30" height="6" rx="3" fill={C.forest} fillOpacity=".2" />
        </g>
      ))}
      <circle cx="96" cy="96" r="13" fill={C.blush} stroke={C.terracotta} strokeWidth="2" />
      <text x="96" y="102" textAnchor="middle" fontSize="16" fontWeight="700" fill={C.terracotta} fontFamily="Outfit, sans-serif">?</text>
    </svg>
  );
}

export function SpeechArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} role="img" aria-label="Two speech bubbles">
      <path d="M12 18a12 12 0 0 1 12-12h44a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12H36l-14 12 2-12a12 12 0 0 1-12-12z" fill={C.pale} stroke={C.forest} strokeWidth="2.5" />
      <text x="46" y="38" textAnchor="middle" fontSize="22" fontWeight="700" fill={C.forest} fontFamily="Outfit, sans-serif">?</text>
      <path d="M56 50a12 12 0 0 1 12-12h28a12 12 0 0 1 12 12v18a12 12 0 0 1-12 12h-4l2 12-14-12H68a12 12 0 0 1-12-12z" fill={C.blush} stroke={C.terracotta} strokeWidth="2.5" />
      <g fill={C.terracotta}><circle cx="72" cy="60" r="3.5" /><circle cx="83" cy="60" r="3.5" /><circle cx="94" cy="60" r="3.5" /></g>
    </svg>
  );
}

export function ConceptArt({ conceptId, className }: { conceptId: ConceptId | string; className?: string }) {
  if (conceptId === "opportunity-cost") return <ChoiceCardsArt className={className} />;
  if (conceptId === "diversification") return <BasketsArt className={className} />;
  return <CashTraysArt className={className} />;
}
