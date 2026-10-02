export const LOGIN_PATH = "/login";

/** WhatsApp 查詢（租格及租格優惠） */
export const WHATSAPP_NUMBER = "85291492405";
export const WHATSAPP_DISPLAY = "+852 9149 2405";

/** wa.me 連結；有格仔編號就喺預設訊息帶埋 */
export function whatsappLink(gridCode?: string) {
  const text = gridCode
    ? `你好，我想查詢租格及租格優惠（格仔 ${gridCode}）`
    : "你好，我想查詢租格及租格優惠";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
