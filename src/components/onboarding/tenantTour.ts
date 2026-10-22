import type { TourStep } from "./SpotlightTour";

/** 租戶專區導覽：教租戶點樣睇自己嘅銷售（目標用 data-tour 標記；冇嘅會自動跳過） */
export function tenantTourSteps({ multiGrid, analyticsEnabled }: { multiGrid: boolean; analyticsEnabled: boolean }): TourStep[] {
  return [
    {
      target: "total",
      title: "你嘅總銷售",
      body: "呢個數就係你格仔賣咗幾多錢、幾多件。店舖每日收舖後匯入收銀記錄，一般翌日就見到最新數字。",
    },
    {
      target: "month",
      title: "揀月份",
      body: "想睇某個月就喺度揀；揀「全部」就係由開檔到而家嘅累計。月尾對數、計交租前睇一睇就最方便。",
    },
    ...(multiGrid
      ? [{ target: "grid", title: "揀格仔", body: "你租咗多過一格，可以逐格睇邊格賣得好，再決定點樣擺貨。" }]
      : []),
    analyticsEnabled
      ? { target: "trend", title: "銷售走勢", body: "睇日／週／月嘅升跌同熱賣貨品，搵出邊段時間最好賣，例如假期前多補貨。" }
      : {
          target: "trend",
          title: "銷售走勢（要開通）",
          body: "走勢分析要店主批准先用到。想睇每日升跌同熱賣排名，可以直接同店主講一聲。",
        },
    {
      target: "items",
      title: "每款貨品賣幾多",
      body: "逐款貨品列出數量同金額。賣得多嘅記得補貨；長期冇郁嘅可以考慮換款或者調價。",
    },
    {
      target: "help",
      title: "隨時重睇",
      body: "唔記得點用？撳呢個「使用教學」可以再睇一次，亦可以喺度改聯絡資料同密碼。如果數字有出入，請直接聯絡店舖。",
    },
  ];
}
