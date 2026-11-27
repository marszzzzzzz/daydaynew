// Shapes returned by the Card Pool API (see REAL_CARDS_AND_MARKET.md §11).

export type Condition = 'MINT' | 'NEAR_MINT' | 'EXCELLENT' | 'GOOD' | 'PLAYED' | 'POOR';
export type CardLanguage = 'en' | 'zh' | 'ja' | 'ko' | 'other';
export type PhotoSide = 'FRONT' | 'BACK';
export type DealStatus = 'OPEN' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'CANCELLED' | 'COMPLETED';
export type DealAction = 'accept' | 'decline' | 'withdraw' | 'cancel' | 'complete';

export interface Category { id: string; name: string; color: string; glyph: string }

export interface Me {
  user: {
    id: string; name: string; region: string | null; accountType: 'PLAYER' | 'COLLECTOR';
    createdAt: number; hasPassword: boolean; whatsapp: string | null;
  };
  facts: { realCards: number };
  dealsNeedingAttention: number;
}

export interface AppConfig {
  config: { regions: string[]; realCards: { currency: string; maxPrice: number; market: { enabled: boolean; maxLiveOffersPerBuyer: number } } };
  categories: (Category & { active: number })[];
}

export interface RealCard {
  id: string; name: string; cardId: string | null; category: Category | null;
  setName: string; number: string; language: CardLanguage; condition: Condition; grade: string;
  quantity: number; notes: string; source: 'OCR' | 'MANUAL'; createdAt: number; updatedAt: number;
  photos: { side: PhotoSide; uploadedAt: number }[];
  currency: string; costPrice: number | null; askingPrice: number | null; estimatedValue: number | null;
  listedQuantity: number; marketPublic: boolean; marketRemovedByAdmin: boolean;
}

export interface Listing {
  id: string; name: string; setName: string; number: string; language: CardLanguage; condition: Condition; grade: string;
  category: Category | null; askingPrice: number; currency: string; available: number; listedAt: number | null;
  photos: PhotoSide[]; seller: { name: string; region: string | null }; mine: boolean;
  myOffer: { id: string; status: DealStatus } | null;
}

export interface DealMessage { id: string; mine: boolean; kind: 'TEXT' | 'EVENT'; body: string; createdAt: number; fromAdmin: boolean }

export interface Deal {
  id: string; role: 'seller' | 'buyer'; status: DealStatus; realCardId: string | null;
  card: { name: string; detail: string; photos: PhotoSide[] };
  price: number; quantity: number; currency: string;
  counterpart: { name: string; region: string | null; whatsapp: string | null };
  createdAt: number; updatedAt: number; unread: number;
  lastMessage: { mine: boolean; kind: 'TEXT' | 'EVENT'; body: string; createdAt: number } | null;
  actions: DealAction[];
  messages?: DealMessage[];
}

export interface Suggestion {
  name: string; setName: string; number: string; categoryId: string | null; cardId: string | null;
  source: 'CATALOG' | 'COMMUNITY' | 'PHOTO'; score: number;
}
