import AnimatedCheck from "./AnimatedCheck";

/** 最後一步：總結做咗乜，預告導覽 */
export default function DoneStep({ done }: { done: string[] }) {
  return (
    <div className="text-center">
      <div className="ob-rise mx-auto flex h-20 w-20 items-center justify-center bg-ink text-ochre">
        <AnimatedCheck size={44} />
      </div>
      <h2 className="ob-rise font-display mt-6 text-3xl font-black tracking-tight" style={{ animationDelay: "160ms" }}>
        設定好喇！
      </h2>
      {done.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-[13.5px] text-ink/70">
          {done.map((d, i) => (
            <li key={d} className="ob-rise" style={{ animationDelay: `${260 + i * 90}ms` }}>
              ✓ {d}
            </li>
          ))}
        </ul>
      )}
      <p className="ob-rise mx-auto mt-5 max-w-xs text-[13.5px] leading-[1.85] text-ink/65" style={{ animationDelay: "420ms" }}>
        跟住用 30 秒帶你認識租戶專區：總銷售喺邊、點揀月份、點睇邊款最好賣。
      </p>
    </div>
  );
}
