// 首頁商品輪播 + 商品 SEO API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/products-test.mjs
const ORIGIN = "http://localhost:3200";
const B = ORIGIN + "/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 300)}`); };
function client() { let cookie = ""; return async (p, input, get) => {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json; }; }

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const blank = { displayName: "", description: "", keywords: "", category: "", latest: false, bestSeller: false, hidden: false };
const names = (cards) => cards.map((c) => c.name);
const showcase = () => anon("products.showcase", undefined, true);

const anon = client();
const boss = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
const sale = (productName, quantity, unitPrice, saleDate) => boss("shop.admin.createSale", { productName, quantity, unitPrice: Number(unitPrice), saleDate });
await sale("保鮮盒", 5, "89", "2026-09-28");
await sale("保鮮盒", 1, "99", "2026-09-28");
await sale("髮夾", 3, "15", "2026-09-20");
await sale("米奇背包", 8, "120", "2026-07-01");
await sale("秘密貨", 10, "50", "2026-09-25");

const s0 = await showcase();
ck("未揀任何貨品 → 兩行都係空（唔會自動公開 POS 貨品）", s0.latest.length === 0 && s0.bestSellers.length === 0, s0);
const list0 = await boss("products.list", {}, true);
ck("後台列出全部賣過嘅貨品（按銷量排）", list0.rows.map((r) => r.sourceName).join() === "秘密貨,米奇背包,保鮮盒,髮夾", list0.rows.map((r) => r.sourceName));
ck("未設定 SEO → 全部未優化、分數 0", list0.counts.todo === 4 && list0.rows.every((r) => r.score === 0), list0.counts);
ck("後台顯示最新售價", list0.rows.find((r) => r.sourceName === "保鮮盒")?.price === "99.00", list0.rows);

const seo = { ...blank, sourceName: "保鮮盒", displayName: "Neoflam 陶瓷保鮮盒 900ml", description: "韓國 Neoflam 陶瓷保鮮盒，可入焗爐同雪櫃，北角日日新格仔鋪有現貨，送禮自用都啱。", keywords: "保鮮盒, Neoflam, 北角", category: "廚具", bestSeller: true };
ck("店主儲存 SEO + 揀做熱銷", (await boss("products.save", seo)).ok === true, null);
await boss("products.save", { ...blank, sourceName: "米奇背包", displayName: "迪士尼米奇背包 D100", bestSeller: true });
const s1 = await showcase();
ck("熱銷 = 店主揀嘅貨品，按加入次序", names(s1.bestSellers).join() === "Neoflam 陶瓷保鮮盒 900ml,迪士尼米奇背包 D100", s1.bestSellers);
ck("熱銷卡用 SEO 名、分類、描述、最新售價", s1.bestSellers.some((c) => c.name === seo.displayName && c.category === "廚具" && c.description === seo.description && c.price === "99.00"), s1.bestSellers);
ck("公開資料唔包括銷量、POS 名等後台欄位", s1.bestSellers.every((c) => !("qty" in c) && !("sourceName" in c) && !("hidden" in c)), s1.bestSellers[0]);
ck("未揀最新商品 → 最新行係空", s1.latest.length === 0, s1.latest);
const scored = (await boss("products.list", { search: "neoflam" }, true)).rows;
ck("搜尋 SEO 名搵到、分數有提升", scored.length === 1 && scored[0].sourceName === "保鮮盒" && scored[0].score > 50 && scored[0].score < 100, scored);

await boss("products.reorderBestSellers", { sourceNames: ["米奇背包", "保鮮盒"] });
ck("調整熱銷次序", names((await showcase()).bestSellers).join() === "迪士尼米奇背包 D100,Neoflam 陶瓷保鮮盒 900ml", null);
const bl = await boss("products.list", { filter: "bestSeller" }, true);
ck("後台熱銷篩選按排序", bl.rows.map((r) => r.sourceName).join() === "米奇背包,保鮮盒", bl.rows.map((r) => r.sourceName));
await boss("products.save", { ...seo, description: "改咗描述，北角有售嘅 Neoflam 保鮮盒，容量 900ml 啱一家人用。" });
ck("再儲存唔會改變熱銷次序", names((await showcase()).bestSellers)[0] === "迪士尼米奇背包 D100", null);

await boss("products.save", { ...blank, sourceName: "髮夾", displayName: "韓系珍珠髮夾", latest: true });
await new Promise((r) => setTimeout(r, 20));
await boss("products.save", { ...blank, sourceName: "秘密貨", latest: true });
const s2 = await showcase();
ck("最新商品 = 店主揀嘅貨品，最新加入排最前", names(s2.latest).join() === "秘密貨,韓系珍珠髮夾", s2.latest);
await boss("products.save", { ...blank, sourceName: "髮夾", displayName: "韓系珍珠髮夾", latest: true, keywords: "髮夾" });
ck("再儲存唔會將舊貨推返最前", names((await showcase()).latest)[0] === "秘密貨", null);
const ll = await boss("products.list", { filter: "latest" }, true);
ck("後台最新篩選按加入時間（新 → 舊）", ll.rows.map((r) => r.sourceName).join() === "秘密貨,髮夾" && ll.counts.latest === 2, ll.rows.map((r) => r.sourceName));

await boss("products.save", { ...blank, sourceName: "秘密貨", hidden: true });
const s3 = await showcase();
ck("隱藏貨品 → 唔再喺最新出現", !names(s3.latest).includes("秘密貨") && names(s3.latest).join() === "韓系珍珠髮夾", s3.latest);
const both = await boss("products.save", { ...blank, sourceName: "髮夾", bestSeller: true, hidden: true });
ck("熱銷 + 隱藏同時揀 → 拒絕", both.code === "BAD_REQUEST", both);
const both2 = await boss("products.save", { ...blank, sourceName: "髮夾", latest: true, hidden: true });
ck("最新 + 隱藏同時揀 → 拒絕", both2.code === "BAD_REQUEST", both2);
const longName = await boss("products.save", { ...blank, sourceName: "髮夾", displayName: "長".repeat(61) });
ck("SEO 名超過 60 字 → 拒絕", longName.code === "BAD_REQUEST", longName);

const svg = await boss("products.setImage", { sourceName: "保鮮盒", image: "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=" });
ck("SVG 相 → 拒絕（可以藏 script）", svg.code === "BAD_REQUEST", svg);
const img = await boss("products.setImage", { sourceName: "保鮮盒", image: PNG });
ck("上載相 → 有版本網址", /^\/api\/products\/\d+\/image\?v=\d+$/.test(img.imageUrl ?? ""), img);
const res = await fetch(ORIGIN + img.imageUrl);
ck("相片網址派返圖片 + 長期快取", res.status === 200 && res.headers.get("content-type") === "image/png" && /immutable/.test(res.headers.get("cache-control") ?? ""), [res.status, res.headers.get("content-type"), res.headers.get("cache-control")]);
ck("相片內容正確", Buffer.from(await res.arrayBuffer()).equals(Buffer.from(PNG.split(",")[1], "base64")), null);
ck("輪播卡有相", (await showcase()).bestSellers.find((c) => c.name === seo.displayName)?.imageUrl === img.imageUrl, null);
await boss("products.setImage", { sourceName: "保鮮盒", image: null });
ck("刪相 → 網址 404", (await fetch(ORIGIN + img.imageUrl)).status === 404, null);
ck("唔存在嘅相 → 404", (await fetch(ORIGIN + "/api/products/9999/image")).status === 404, null);

await boss("products.save", { ...blank, sourceName: "髮夾", displayName: "</script><script>alert(1)</script>", latest: true });
const llms = await (await fetch(ORIGIN + "/llms.txt")).text();
ck("llms.txt 有店舖資料、最新、熱銷（用 SEO 名）", llms.includes("北角") && llms.includes("## 最新商品") && llms.includes("## 熱銷產品") && llms.includes("Neoflam 陶瓷保鮮盒 900ml（HK$99）"), llms);
ck("llms.txt 唔包括隱藏貨品", !llms.includes("秘密貨"), llms);

await boss("account.createAccount", { username: "staff7", password: "staff123", name: "店員", role: "staff" });
const staff = client();
await staff("account.login", { username: "staff7", password: "staff123" });
ck("店員改商品 SEO → FORBIDDEN", (await staff("products.save", { ...blank, sourceName: "髮夾" })).code === "FORBIDDEN", null);
ck("店員改熱銷次序 → FORBIDDEN", (await staff("products.reorderBestSellers", { sourceNames: ["髮夾"] })).code === "FORBIDDEN", null);
ck("未登入讀後台列表 → UNAUTHORIZED", (await anon("products.list", {}, true)).code === "UNAUTHORIZED", null);
ck("未登入上載相 → UNAUTHORIZED", (await anon("products.setImage", { sourceName: "髮夾", image: PNG })).code === "UNAUTHORIZED", null);

for (const n of ["保鮮盒", "米奇背包", "髮夾"]) await boss("products.save", { ...blank, sourceName: n });
const sOff = await showcase();
ck("全部取消 → 兩行都係空（首頁唔顯示）", sOff.latest.length === 0 && sOff.bestSellers.length === 0, sOff);
const llmsOff = await (await fetch(ORIGIN + "/llms.txt")).text();
ck("冇揀貨品 → llms.txt 只有店舖資料", llmsOff.includes("北角") && !llmsOff.includes("最新商品") && !llmsOff.includes("熱銷產品"), llmsOff);
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
