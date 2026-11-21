import { Clock, MapPin, Wallet } from 'lucide-react';
import type { FulfilmentPreference, TradeoffWeights } from '../../types';
import { getWeightsForPreference } from '../../services/fulfilmentService';

interface TradeoffSliderProps {
  value: FulfilmentPreference;
  weights: TradeoffWeights;
  onChange: (nextPreference: FulfilmentPreference, nextWeights: TradeoffWeights) => void;
}

const OPTIONS: Array<{
  value: FulfilmentPreference;
  label: string;
  caption: string;
  Icon: typeof Wallet;
}> = [
  {
    value: 'SAVE_MONEY',
    label: 'Save Money',
    caption: 'Lowest total cost',
    Icon: Wallet,
  },
  {
    value: 'GET_IT_FASTER',
    label: 'Get It Faster',
    caption: 'Shortest readiness window',
    Icon: Clock,
  },
  {
    value: 'SHOP_NEARBY',
    label: 'Shop Nearby',
    caption: 'Closest eligible store',
    Icon: MapPin,
  },
];

export function TradeoffSlider({ value, weights, onChange }: TradeoffSliderProps) {
  // Map current weights to a 0..100 Cost <-> Speed/Proximity slider position
  const total = Math.max(1, weights.cost + weights.speed + weights.proximity);
  const costPct = Math.round((weights.cost / total) * 100);
  const speedPct = Math.round((weights.speed / total) * 100);
  const proxPct = Math.max(0, 100 - costPct - speedPct);

  const sliderValue = 100 - costPct;

  const handleSliderChange = (pos: number) => {
    const nextCost = 100 - pos;
    const remaining = pos;
    // Maintain user's active speed vs proximity bias when sliding toward faster/nearby
    const nextSpeed =
      value === 'SHOP_NEARBY' ? Math.round(remaining * 0.3) : Math.round(remaining * 0.75);
    const nextProx = Math.max(0, remaining - nextSpeed);
    const nextPref: FulfilmentPreference =
      nextCost >= 55 ? 'SAVE_MONEY' : nextSpeed >= nextProx ? 'GET_IT_FASTER' : 'SHOP_NEARBY';
    onChange(nextPref, { cost: nextCost, speed: nextSpeed, proximity: nextProx });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#1A2022]">Fulfilment Trade-off Slider</span>
        <span className="text-xs text-[#526063] font-mono-tabular">
          Cost {costPct}% · Speed {speedPct}% · Nearby {proxPct}%
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Fulfilment priority presets"
        className="grid grid-cols-3 gap-1.5 p-1 bg-[#F0F2F1] border border-[#E1E5E4] rounded-lg"
      >
        {OPTIONS.map(({ value: optValue, label, caption, Icon }) => {
          const active = value === optValue;
          return (
            <button
              key={optValue}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(optValue, getWeightsForPreference(optValue))}
              className={`flex flex-col items-start text-left px-3 py-2.5 rounded-md transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#264C4F] ${
                active
                  ? 'bg-white text-[#1A2022] shadow-xs border border-[#D4DAD8]'
                  : 'text-[#526063] hover:text-[#1A2022]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#264C4F]' : 'text-[#526063]'}`}
                  aria-hidden="true"
                />
                {label}
              </span>
              <span className="text-[11px] text-[#526063] mt-0.5 truncate w-full">{caption}</span>
            </button>
          );
        })}
      </div>

      {/* Continuous real-time trade-off balance slider */}
      <div className="px-3 py-2.5 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-[#526063]">
          <span>Prioritize Lowest Fee</span>
          <span>Balanced</span>
          <span>Prioritize Speed &amp; Proximity</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={sliderValue}
          aria-label="Fine-tune cost versus speed and proximity balance"
          onChange={(e) => handleSliderChange(Number(e.target.value))}
          className="w-full accent-[#264C4F] cursor-pointer h-1.5"
        />
      </div>
    </div>
  );
}
