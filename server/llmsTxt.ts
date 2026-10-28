import type { ShowcaseCard } from "@contracts/products";
import { buildShowcase } from "./productsRouter";
import { publicStats } from "./queries/shop";

const WHATSAPP_DISPLAY = "+852 9149 2405";

function productLine(p: ShowcaseCard) {
  const price = p.price ? `（HK$${Number(p.price).toFixed(0)}）` : "";
  return `- ${p.name}${price}${p.description ? `：${p.description}` : ""}`;
}

/**
 * /llms.txt：俾 ChatGPT、Perplexity 之類 AI 搜尋讀嘅純文字店舖簡介（GEO / AEO）。
 * 呢個網站係 SPA，大部分 AI 爬蟲唔行 JavaScript，睇唔到首頁輪播，所以喺伺服器砌好。
 */
export async function buildLlmsTxt(origin: string): Promise<string> {
  const [stats, showcase] = await Promise.all([publicStats(), buildShowcase()]);
  const rent = stats.sizeRent
    .map((r) => `${r.size === "L" ? "大格" : "中格"} 每月 HK$${Number(r.minRent).toFixed(0)} 起`)
    .join("、");
  const lines = [
    "# 日日新格仔鋪 DayDayNew.HK",
    "",
    "> 香港北角格仔鋪：租一個格仔就可以寄賣手作、figure、文具、古著、生活雜貨。店員負責上架同收銀，租戶網上睇每日銷售記錄。",
    "",
    "## 店舖資料",
    "- 地區：香港北角",
    "- 營業時間：每日 11:30 – 19:30",
    `- WhatsApp 查詢：${WHATSAPP_DISPLAY}`,
    `- 網站：${origin}/`,
    "",
    "## 租格",
    `- 共 ${stats.grids.total} 格，而家 ${stats.grids.vacant} 格招租中`,
    ...(rent ? [`- 收費：${rent}，包上架及收銀，簽約收一個月按金`] : []),
  ];
  if (showcase.latest.length) lines.push("", "## 最新商品", ...showcase.latest.map(productLine));
  if (showcase.bestSellers.length) lines.push("", "## 熱銷產品", ...showcase.bestSellers.map(productLine));
  return lines.join("\n") + "\n";
}
