const COLS = 8;
const ROWS = 4;
const CELL_STAGGER_MS = 28;

/** 第一步：歡迎 + 一幅會逐格砌出嚟嘅格仔牆，自己租嘅格會發光 */
export default function WelcomeStep({ name, grids, isDemo }: { name: string; grids: string[]; isDemo: boolean }) {
  // 冇格號就用頭一格做示意
  const mine = new Set(grids.length ? grids.map((g) => Number(g) % (COLS * ROWS)) : [0]);
  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length: COLS * ROWS }, (_, i) => (
          <span
            key={i}
            className={`aspect-square border ${mine.has(i) ? "ob-cell-mine border-ink bg-ochre" : "ob-cell border-ink/20 bg-cream-2"}`}
            style={{ animationDelay: `${i * CELL_STAGGER_MS}ms` }}
          />
        ))}
      </div>
      <p className="ob-rise spec-label mt-7" style={{ animationDelay: "500ms" }}>
        Welcome — 歡迎加入
      </p>
      <h2 className="ob-rise font-display mt-2 text-3xl font-black leading-tight tracking-tight" style={{ animationDelay: "580ms" }}>
        {name}，你好！
      </h2>
      <p className="ob-rise mt-3 text-[14px] leading-[1.9] text-ink/70" style={{ animationDelay: "660ms" }}>
        {grids.length > 0 ? `你嘅格仔：${grids.join("、")}。` : ""}呢度係你嘅租戶專區，可以隨時睇自己格仔嘅銷售。
        {isDemo ? "（示範戶口：直接帶你睇一圈。）" : "我哋用 1 分鐘幫你完成兩樣設定，再帶你睇一圈。"}
      </p>
      <ul className="mt-5 space-y-2 text-[13.5px]">
        {["每日銷售，翌日更新", "按月份、格仔睇數", "邊款貨最好賣"].map((t, i) => (
          <li key={t} className="ob-rise flex items-center gap-3" style={{ animationDelay: `${760 + i * 90}ms` }}>
            <span className="font-mono text-[11px] text-ochre-deep">0{i + 1}</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
