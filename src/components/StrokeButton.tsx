import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "cream";
};

/** 動態描邊 pill 按鈕：hover 時描邊繞按鈕一圈 */
const StrokeButton = forwardRef<HTMLButtonElement, Props>(function StrokeButton(
  { variant = "solid", className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "btn-stroke",
        variant === "solid" && "bg-ink text-cream",
        variant === "outline" && "border border-ink/45 text-ink hover:border-transparent",
        variant === "cream" && "bg-cream text-ink",
        className,
      )}
      {...props}
    >
      <svg className="btn-stroke-svg" aria-hidden="true">
        <rect
          className="btn-stroke-rect"
          x="0"
          y="0"
          width="100%"
          height="100%"
          rx="999"
          pathLength={100}
          stroke={variant === "solid" ? "#F8F7E5" : variant === "cream" ? "#B39C4F" : "#B39C4F"}
        />
      </svg>
      {children}
    </button>
  );
});

export default StrokeButton;
