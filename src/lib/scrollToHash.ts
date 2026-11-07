/**
 * 網址 hash 指住呢段就捲過去，傳回有冇捲到。
 * 俾資料載入後先出現嘅區段用：瀏覽器開頁嗰刻搵唔到，唔會自己捲。
 */
export function scrollToHashSection(sectionId: string, hash: string, doc: Pick<Document, "getElementById">): boolean {
  if (hash !== `#${sectionId}`) return false;
  const section = doc.getElementById(sectionId);
  if (!section) return false;
  section.scrollIntoView();
  return true;
}
