import { type ReactNode } from "react";

export function SectionTitle({ no, title, desc }: { no: string; title: string; desc?: string }) {
  return (
    <div className="mb-8">
      <p className="spec-label">{no}</p>
      <h2 className="font-display mt-1.5 text-3xl font-black tracking-tight">{title}</h2>
      {desc && <p className="mt-2 max-w-xl text-[13.5px] leading-[1.85] text-ink/65">{desc}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="spec-label mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

export function ActionButton({
  children,
  onClick,
  disabled,
  tone = "ink",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "ink" | "ochre" | "ghost" | "red";
}) {
  const cls =
    tone === "ink"
      ? "bg-ink text-cream hover:-translate-y-0.5"
      : tone === "ochre"
        ? "bg-ochre text-ink hover:-translate-y-0.5"
        : tone === "red"
          ? "border border-red-800/60 text-red-800 hover:bg-red-800 hover:text-cream"
          : "border border-ink/40 text-ink hover:bg-ink hover:text-cream";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 font-mono text-[11.5px] uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-14 text-center text-ink/45">
        {text}
      </td>
    </tr>
  );
}

export const statusBadge: Record<string, string> = {
  vacant: "border-ochre-deep/60 text-ochre-deep",
  occupied: "border-ink/60 text-ink",
  reserved: "border-tang/70 text-tang",
  active: "border-ink/60 text-ink",
  ended: "border-ink/30 text-ink/45",
  paid: "border-ink/60 text-ink",
  unpaid: "border-tang/70 text-tang",
};

export const statusLabel: Record<string, string> = {
  vacant: "招租中",
  occupied: "已租出",
  reserved: "已預留",
  active: "生效中",
  ended: "已完結",
  paid: "已收",
  unpaid: "未收",
  rent: "租金",
  deposit: "按金",
};
