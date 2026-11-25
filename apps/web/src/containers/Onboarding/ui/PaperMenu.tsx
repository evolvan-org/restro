import { cn } from 'cn';
import type { ReactElement } from 'react';

/* Decorative printed-menu illustration from the design (fictional demo content). */

const LEFT: [string, string?][] = [
  ['STARTERS'],
  ['Paneer Tikka', '280'],
  ['Chilli Paneer Dry', '260'],
  ['Veg Manchurian', '220'],
  ['Hara Bhara Kebab', '240'],
  ['Chicken Tikka', '320'],
  ['MAIN COURSE'],
  ['Dal Makhani', '240'],
  ['Paneer Butter Masala', '290'],
  ['Butter Chicken', '340'],
];
const RIGHT: [string, string?][] = [
  ['BREADS & RICE'],
  ['Butter Naan', '60'],
  ['Tandoori Roti', '25'],
  ['Jeera Rice', '140'],
  ['DRINKS'],
  ['Masala Chai', '40'],
  ['Sweet Lassi', '90'],
  ['Fresh Lime Soda', '70'],
];

function Column({ rows }: { rows: [string, string?][] }): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {rows.map(([name, price]) =>
        price === undefined ? (
          <div
            key={name}
            className="flex h-[22px] items-center text-[9px] font-bold tracking-[0.14em] text-[#7a4b12]"
          >
            {name}
          </div>
        ) : (
          <div
            key={name}
            className="flex h-[18px] items-baseline gap-1 text-[10px] whitespace-nowrap"
          >
            <span className="truncate">{name}</span>
            <i className="flex-1 -translate-y-[3px] border-b border-dotted border-[#8a7a5c]" />
            <span>{price}</span>
          </div>
        ),
      )}
    </div>
  );
}

export function PaperMenu({ className }: { className?: string }): ReactElement {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-[4px] bg-[#f4ecd8] px-4 pt-3 pb-6 font-serif text-[#3a2e1c] shadow-[0_10px_30px_rgba(0,0,0,.28)]',
        className,
      )}
    >
      <div className="text-center">
        <div className="text-[13px] font-bold tracking-[0.18em] text-[#7a4b12]">ANNAPURNA</div>
        <div className="mt-0.5 text-[9px]">अन्नपूर्णा · Family Restaurant</div>
      </div>
      <div className="mt-2 flex gap-3">
        <Column rows={LEFT} />
        <Column rows={RIGHT} />
      </div>
      <div className="absolute inset-x-4 bottom-2 text-center text-[8.5px] text-[#7a6a4c]">
        ★ All prices inclusive of taxes ★
      </div>
    </div>
  );
}
