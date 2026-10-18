'use client';
// Two languages: Traditional Chinese (default, like Card Pool) and English. The first visit follows the
// browser's language (lib/lang.ts); a choice is kept in the cm_lang cookie so the server renders it on the first paint.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from './api';
import type { Lang } from './lang';

export type { Lang };

const D = {
  // shell
  brand: ['日日新卡市', 'DayDayNew Card Market'],
  'nav.market': ['市場', 'Market'],
  'nav.sell': ['我要賣', 'Sell'],
  'nav.deals': ['我的交易', 'Deals'],
  'nav.account': ['帳戶', 'Account'],
  'nav.signin': ['登入', 'Sign in'],
  'nav.signup': ['免費開戶', 'Sign up free'],
  'footer.noPayment': ['本站不經手付款：買賣雙方自行見面驗卡、付款。', 'This site never takes payment — buyer and seller meet, check the card and pay in person.'],
  'footer.shared': ['使用 Card Pool 帳戶：同一個名稱和密碼。', 'Runs on Card Pool accounts — same name, same password.'],
  // landing
  'hero.title': ['實體卡，玩家之間直接買賣', 'Real cards, traded player to player'],
  'hero.sub': ['上載你的卡、定價放上市場；買家出價，你接受後雙方以 WhatsApp 聯絡，見面交收。', 'Photograph your card, set a price and list it. Buyers make offers — accept one and you both get each other’s WhatsApp to meet up.'],
  'hero.start': ['開始賣卡', 'Start selling'],
  'hero.browse': ['登入看市場', 'Sign in to browse'],
  'how.1.t': ['上載及定價', 'List it'],
  'how.1.d': ['拍下卡面，填寫狀態和叫價，勾選公開出售。', 'Snap the card, add its condition and asking price, tick “list publicly”.'],
  'how.2.t': ['收到出價', 'Get offers'],
  'how.2.d': ['買家按每張出價，可附留言；由你決定接受或拒絕。', 'Buyers offer a price per copy, with a message. You accept or decline.'],
  'how.3.t': ['見面交收', 'Meet & swap'],
  'how.3.d': ['接受後雙方看到對方 WhatsApp；驗卡、付款在站外完成，再標記完成。', 'Once accepted you both see each other’s WhatsApp. Check the card, pay in person, mark it completed.'],
  'landing.safe': ['你的 WhatsApp 永不公開，只在交易被接受後向對方顯示。', 'Your WhatsApp is never public — only the other side of an accepted deal sees it.'],
  'landing.shared': ['已有 Card Pool 帳戶？用同一個名稱和密碼登入。', 'Already on Card Pool? Sign in with the same name and password.'],
  // market
  'market.title': ['玩家市場', 'Player market'],
  'market.search': ['搜尋卡名、系列或編號', 'Search name, set or number'],
  'market.all': ['全部', 'All'],
  'market.sortBy': ['排序', 'Sort by'],
  'market.sort.new': ['最新上架', 'Newest'],
  'market.sort.price_asc': ['價錢：低至高', 'Price: low to high'],
  'market.sort.price_desc': ['價錢：高至低', 'Price: high to low'],
  'market.count': ['{n} 張卡出售中', '{n} listings'],
  'market.countCap': ['顯示最新 {n} 張，請用搜尋或分類收窄', 'Showing the newest {n} — search or pick a category to narrow down'],
  'market.empty': ['暫時未有符合的卡。', 'No cards match yet.'],
  'market.empty.cta': ['放上你的第一張卡', 'List your first card'],
  'market.closed': ['玩家市場暫停中，進行中的交易仍可完成。', 'The player market is closed for now. Running deals can still finish.'],
  'listing.mine': ['你的卡', 'Your card'],
  'listing.offered': ['已出價', 'Offer sent'],
  'listing.available': ['{n} 張可售', '{n} available'],
  'listing.each': ['每張', 'each'],
  'listing.back': ['返回市場', 'Back to market'],
  'listing.seller': ['賣家', 'Seller'],
  'listing.listed': ['上架', 'Listed'],
  'listing.notFound': ['這張卡已不在市場上。', 'This card is no longer for sale.'],
  'listing.yours': ['這是你的卡。', 'This is your listing.'],
  'listing.edit': ['編輯', 'Edit'],
  'side.FRONT': ['正面', 'Front'],
  'side.BACK': ['背面', 'Back'],
  'field.set': ['系列', 'Set'],
  'field.number': ['編號', 'Number'],
  'field.language': ['語言', 'Language'],
  'field.condition': ['狀態', 'Condition'],
  'field.grade': ['評級', 'Grade'],
  'field.category': ['類別', 'Category'],
  // offer
  'offer.title': ['出價', 'Make an offer'],
  'offer.price': ['每張出價（{cur}）', 'Price per copy ({cur})'],
  'offer.qty': ['張數', 'Copies'],
  'offer.message': ['留言（可選）', 'Message (optional)'],
  'offer.message.ph': ['例如：可以在旺角交收嗎？', 'e.g. Could we meet in Mong Kok?'],
  'offer.total': ['合共', 'Total'],
  'offer.submit': ['送出出價', 'Send offer'],
  'offer.note': ['賣家接受後，你們會看到對方的 WhatsApp。本站不收款。', 'If the seller accepts, you’ll both see each other’s WhatsApp. No payment on this site.'],
  'offer.needsPassword': ['出價前請先為帳戶設定密碼。', 'Set a password for your account before making an offer.'],
  'offer.existing': ['你已對這張卡出價。', 'You already have an offer on this card.'],
  'offer.viewDeal': ['查看交易', 'View deal'],
  // sell
  'sell.title': ['我要賣', 'Sell your cards'],
  'sell.sub': ['你的實體卡紀錄。開啟「公開出售」的卡會出現在玩家市場。', 'Your real cards. Cards switched to “list publicly” appear in the player market.'],
  'sell.add': ['新增卡', 'Add a card'],
  'sell.ready.title': ['開始賣卡前', 'Before you sell'],
  'sell.ready.password': ['設定密碼', 'Set a password'],
  'sell.ready.whatsapp': ['加入 WhatsApp 號碼', 'Add your WhatsApp number'],
  'sell.ready.fix': ['前往設定', 'Set up'],
  'sell.empty': ['還未有卡。新增第一張卡開始出售。', 'No cards yet. Add your first card to start selling.'],
  'sell.stats.cards': ['卡片紀錄', 'Card records'],
  'sell.stats.live': ['市場上', 'In the market'],
  'sell.stats.value': ['上架總值', 'Listed value'],
  'sell.toggle': ['公開出售', 'List publicly'],
  'status.live': ['出售中', 'Live'],
  'status.hidden': ['未公開', 'Not listed'],
  'status.removed': ['已被管理員移除', 'Removed by admin'],
  'status.needsPrice': ['需要叫價', 'Needs a price'],
  'status.needsQty': ['需要出售張數', 'Needs copies for sale'],
  'status.needsAccount': ['帳戶未準備好', 'Account not ready'],
  'card.owned': ['擁有 {n} 張', '{n} owned'],
  'card.forSale': ['{n} 張出售', '{n} for sale'],
  'card.noPrice': ['未定價', 'No price'],
  // card form
  'form.new': ['新增卡', 'Add a card'],
  'form.edit': ['編輯卡', 'Edit card'],
  'form.photos': ['相片', 'Photos'],
  'form.photo.FRONT': ['正面相片', 'Front photo'],
  'form.photo.BACK': ['背面相片（可選）', 'Back photo (optional)'],
  'form.photo.add': ['拍照或選擇相片', 'Take or choose a photo'],
  'form.photo.replace': ['更換', 'Replace'],
  'form.photo.remove': ['移除', 'Remove'],
  'form.photo.hint': ['會自動縮細至 1600px 再上載。只有你、管理員，以及公開出售時的已登入會員看得到。', 'Resized to 1600px before upload. Seen only by you, admins and — while listed — signed-in members.'],
  'form.details': ['卡片資料', 'Card details'],
  'form.name': ['卡名', 'Card name'],
  'form.name.ph': ['例如：Charizard', 'e.g. Charizard'],
  'form.suggest': ['建議：', 'Suggestions:'],
  'form.category.none': ['未分類', 'No category'],
  'form.quantity': ['擁有張數', 'Copies owned'],
  'form.grade.ph': ['例如：PSA 10', 'e.g. PSA 10'],
  'form.number.ph': ['例如：004/102', 'e.g. 004/102'],
  'form.set.ph': ['例如：Base Set', 'e.g. Base Set'],
  'form.selling': ['出售', 'Selling'],
  'form.asking': ['叫價（每張，{cur}）', 'Asking price (per copy, {cur})'],
  'form.listed': ['出售張數', 'Copies for sale'],
  'form.cost': ['買入價（只有你看到）', 'What you paid (private)'],
  'card.cost': ['成本 {price}', 'Cost {price}'],
  'tags.title': ['標籤（卡的特點）', 'Tags (what makes this copy special)'],
  'tags.hint': ['可選多個；亦可自行輸入，按 Enter 加入。', 'Pick any that apply, or type your own and press Enter.'],
  'tags.custom': ['自訂標籤', 'Custom tag'],
  'tags.custom.ph': ['自訂標籤，例如：金框', 'Your own tag, e.g. Gold border'],
  'tags.add': ['加入', 'Add'],
  'tags.full': ['最多 {n} 個標籤', 'Up to {n} tags'],
  'tags.remove': ['移除標籤 {tag}', 'Remove tag {tag}'],
  'tags.serial': ['限號', 'Serial number'],
  'tags.serial.ph': ['例如：23/99', 'e.g. 23/99'],
  'tags.serial.hint': ['限量卡上印的編號（第幾張／共幾張），不是卡號。', 'The print-run number stamped on the card (copy / run), not the card number.'],
  'tags.serial.range': ['限號的第一個數字不可大於總數，例如 23/99。', 'The copy number can’t be larger than the print run, e.g. 23/99.'],
  'tags.serialBadge': ['限號', '#'],
  'tags.private': ['標籤和限號暫時只有你看到（未在市場顯示）。', 'Tags and serial number are only visible to you for now (not shown in the market yet).'],
  'tag.AUTO': ['簽名', 'Autograph'],
  'tag.PATCH': ['球衣／布料', 'Patch / relic'],
  'tag.MULTI': ['多球員', 'Multi-player'],
  'tag.ROOKIE': ['新人卡 RC', 'Rookie (RC)'],
  'tag.PARALLEL': ['平行版', 'Parallel'],
  'tag.REFRACTOR': ['折射／閃卡', 'Refractor / holo'],
  'tag.INSERT': ['特別卡 Insert', 'Insert'],
  'tag.SHORT_PRINT': ['低印量 SP', 'Short print (SP)'],
  'tag.ERROR': ['錯版', 'Error card'],
  'form.notes': ['備註（只有你看到）', 'Notes (private)'],
  'form.public': ['在玩家市場公開出售', 'List publicly in the player market'],
  'form.public.hint': ['需要叫價、出售張數至少 1 張，以及帳戶已設定密碼和 WhatsApp。', 'Needs an asking price, at least 1 copy for sale, and a password and WhatsApp on your account.'],
  'form.save': ['儲存', 'Save'],
  'form.saving': ['儲存中…', 'Saving…'],
  'form.saved': ['已儲存', 'Saved'],
  'form.delete': ['刪除這張卡', 'Delete this card'],
  'form.delete.confirm': ['刪除後，相片會一併刪除，進行中的交易會被取消。確定刪除？', 'Deleting it removes its photos and cancels its live deals. Delete it?'],
  'form.photoFailed': ['卡已儲存，但相片上載失敗：{msg}', 'Card saved, but the photo upload failed: {msg}'],
  'form.listFailed': ['卡已儲存，但未能公開出售：{msg}', 'Card saved, but it could not be listed: {msg}'],
  'form.nameShort': ['卡名最少 2 個字元', 'Card name needs at least 2 characters'],
  'form.stale': ['這張卡剛在別處更新了（例如交易已完成）。請先重新載入最新資料，再作修改。', 'This card just changed elsewhere (for example a deal completed). Reload the latest version before editing.'],
  'form.reload': ['重新載入', 'Reload latest'],
  'form.notFound': ['找不到這張卡。', 'Card not found.'],
  // deals
  'deals.title': ['我的交易', 'My deals'],
  'deals.received': ['收到的出價', 'Offers received'],
  'deals.sent': ['我的出價', 'Offers sent'],
  'deals.unread': ['{n} 個有未讀訊息', '{n} with unread messages'],
  'deals.empty.received': ['還未收到出價。', 'No offers received yet.'],
  'deals.empty.sent': ['你還未出價。', 'You have not made any offers.'],
  'deal.with': ['對方：{name}', 'with {name}'],
  'deal.each': ['每張 {price} × {qty} 張', '{price} each × {qty}'],
  'deal.back': ['返回交易', 'Back to deals'],
  'deal.notFound': ['找不到這個交易。', 'Deal not found.'],
  'deal.whatsapp': ['{name} 的 WhatsApp', '{name}’s WhatsApp'],
  'deal.whatsapp.open': ['在 WhatsApp 開啟對話', 'Chat on WhatsApp'],
  'deal.whatsapp.none': ['對方未有提供 WhatsApp，請在下面留言聯絡。', 'They haven’t added a WhatsApp number — use the messages below.'],
  'deal.whatsapp.msg': ['你好 {name}，關於 Card Pool 上 {card} 的交易（{qty} × {price}）。', 'Hi {name}, about the Card Pool deal for {card} ({qty} × {price}).'],
  'deal.messages': ['對話', 'Conversation'],
  'deal.compose': ['寫訊息…', 'Write a message…'],
  'deal.send': ['傳送', 'Send'],
  'deal.closedNoMsg': ['交易已結束，不能再傳訊息。', 'This deal is closed — no new messages.'],
  'deal.admin': ['管理員', 'Admin'],
  'deal.you': ['你', 'You'],
  'deal.total': ['合共', 'Total'],
  'deal.started': ['開始於 {when}', 'Started {when}'],
  'deal.next.seller.OPEN': ['接受出價後，雙方會看到對方的 WhatsApp 以約定交收。', 'Accept to share WhatsApp numbers and arrange the meet-up.'],
  'deal.next.buyer.OPEN': ['等待賣家回覆。你可以留言或撤回出價。', 'Waiting for the seller. You can message them or withdraw.'],
  'deal.next.seller.ACCEPTED': ['約買家見面、驗卡、收款後，按「標記為已完成」。', 'Meet the buyer, let them check the card, get paid — then mark it completed.'],
  'deal.next.buyer.ACCEPTED': ['賣家已接受！用 WhatsApp 約定見面，驗卡後才付款。', 'The seller accepted! Arrange the meet-up on WhatsApp, check the card, then pay.'],
  'deal.next.closed': ['這個交易已結束。', 'This deal is closed.'],
  'dstatus.OPEN': ['等待回覆', 'Waiting'],
  'dstatus.ACCEPTED': ['已接受', 'Accepted'],
  'dstatus.DECLINED': ['已拒絕', 'Declined'],
  'dstatus.WITHDRAWN': ['已撤回', 'Withdrawn'],
  'dstatus.CANCELLED': ['已取消', 'Cancelled'],
  'dstatus.COMPLETED': ['已完成', 'Completed'],
  'action.accept': ['接受出價', 'Accept'],
  'action.decline': ['拒絕', 'Decline'],
  'action.withdraw': ['撤回出價', 'Withdraw offer'],
  'action.cancel': ['取消交易', 'Cancel deal'],
  'action.complete': ['標記為已完成', 'Mark as completed'],
  'confirm.accept': ['接受這個出價？雙方會看到對方的 WhatsApp。', 'Accept this offer? You’ll both see each other’s WhatsApp.'],
  'confirm.decline': ['拒絕這個出價？', 'Decline this offer?'],
  'confirm.withdraw': ['撤回你的出價？', 'Withdraw your offer?'],
  'confirm.cancel': ['取消這個交易？', 'Cancel this deal?'],
  'confirm.complete': ['確認已見面交收並收款？已售出的張數會從你的紀錄扣除。', 'Confirm you met, handed over the card and got paid? The sold copies come off your record.'],
  'confirm.yes': ['確定', 'Confirm'],
  'confirm.no': ['返回', 'Go back'],
  'event.OFFER_MADE': ['買家出價', 'Offer made'],
  'event.ACCEPTED': ['賣家接受了出價', 'Seller accepted the offer'],
  'event.DECLINED': ['賣家拒絕了出價', 'Seller declined the offer'],
  'event.WITHDRAWN': ['買家撤回了出價', 'Buyer withdrew the offer'],
  'event.CANCELLED': ['交易已取消', 'Deal cancelled'],
  'event.COMPLETED': ['交易已完成', 'Deal completed'],
  'event.CARD_REMOVED': ['賣家已移除這張卡', 'The seller removed this card'],
  'event.LISTING_REMOVED': ['管理員已將這張卡從市場移除', 'An admin removed this listing'],
  'event.ADMIN_CANCELLED': ['管理員已取消這個交易', 'An admin cancelled this deal'],
  // batch scan
  'batch.noCamera': ['這部裝置無法使用相機，可以按右下角從相簿加入相片。', 'No camera available — add photos with the gallery button instead.'],
  'batch.denied': ['未獲准使用相機。請在瀏覽器設定允許，或從相簿加入相片。', 'Camera access was refused. Allow it in browser settings, or add photos from the gallery.'],
  'batch.close': ['關閉', 'Close'],
  'batch.starting': ['啟動相機中…', 'Starting camera…'],
  'batch.full': ['已拍滿 {n} 張，按「下一步」選取文字', '{n} cards captured — tap Next to pick the text'],
  'batch.fullShort': ['已滿', 'Full'],
  'batch.sharp': ['清晰', 'Sharp'],
  'batch.steady': ['保持穩定', 'Hold steady'],
  'batch.help': ['使用說明', 'How it works'],
  'batch.torch': ['閃光燈', 'Flash'],
  'batch.tap.FRONT': ['輕觸拍攝正面', 'Tap to shoot the front'],
  'batch.tap.BACK': ['翻轉卡片，輕觸拍攝背面', 'Flip the card, tap to shoot the back'],
  'batch.retake.FRONT': ['重拍正面', 'Retake front'],
  'batch.retake.BACK': ['重拍背面', 'Retake back'],
  'batch.add.FRONT': ['加拍正面', 'Add front'],
  'batch.add.BACK': ['加拍背面', 'Add back'],
  'batch.skipBack': ['略過背面 →', 'Skip back →'],
  'batch.zoom': ['縮放', 'Zoom'],
  'batch.gallery': ['從相簿加入', 'Add from gallery'],
  'batch.recent': ['最近掃描', 'Recent scans'],
  'batch.next': ['下一步（{n}）→', 'Next ({n}) →'],
  'batch.nextCard': ['下一張掃描', 'Next scan'],
  'batch.both': ['正+背', 'F+B'],
  'batch.frontOnly': ['正面', 'Front'],
  'batch.modeBatch': ['多張', 'Batch'],
  'batch.modeSingle': ['單張', 'Single'],
  'batch.help1': ['把卡放入框內，光線充足、避免反光。', 'Put the card inside the frame, in good light, without glare.'],
  'batch.help2': ['狀態顯示「清晰」時輕觸框內拍攝：先拍正面，再翻轉拍背面（可略過）。', 'When the status shows Sharp, tap inside the frame: front first, then flip for the back (or skip it).'],
  'batch.help3': ['每批最多 {n} 張；點縮圖可重拍或刪除。', 'Up to {n} cards per batch; tap a thumbnail to retake or delete.'],
  'batch.help4': ['按「下一步」選取卡上文字、輸入價錢，再一次過儲存。', 'Tap Next to pick the card text, add prices and save them all at once.'],
  'batch.gotIt': ['明白', 'Got it'],
  'batch.delete': ['刪除', 'Delete'],
  'batch.empty': ['這批還未有卡。', 'No cards in this batch yet.'],
  'batch.open': ['開始批次掃描', 'Start batch scan'],
  'batch.reviewTitle': ['選取文字及定價', 'Pick text and prices'],
  'batch.reviewSub': ['{n} 張卡（每批最多 {max} 張）。點選辨識到的文字填入欄位，再輸入價錢。', '{n} cards (up to {max}). Tap the recognised text to fill each field, then add a price.'],
  'batch.ocrLang': ['辨識語言', 'Text language'],
  'ocrLang.auto': ['自動偵測', 'Detect automatically'],
  'ocrLang.en': ['英文', 'English'],
  'ocrLang.zh': ['中文（繁體）+ 英文', 'Chinese (Traditional) + English'],
  'ocrLang.ja': ['日文 + 英文', 'Japanese + English'],
  'ocrLang.ko': ['韓文 + 英文', 'Korean + English'],
  'batch.sports': ['球員卡：已從正面及背面頂部讀取球員姓名和卡編號，出版商和年份記錄在備註（背面數據已略過）。請核對。', 'Player card: name and card number read from the front and the top of the back; publisher and year put in the notes (stats skipped). Please check.'],
  'batch.notesAuto': ['由卡背底部的出版商及年份自動填入', 'Filled from the publisher and year at the bottom of the back'],
  'batch.notes.ph': ['例如：Panini Prizm · 2023-24', 'e.g. Panini Prizm · 2023-24'],
  'batch.langDetected': ['按卡面文字自動判斷', 'Detected from the card text'],
  'batch.more': ['再拍', 'Shoot more'],
  'batch.notReady': ['帳戶未設定密碼或 WhatsApp：卡會儲存，但未能公開出售。', 'Your account has no password or WhatsApp yet: cards will be saved but cannot be listed.'],
  'batch.saving': ['儲存中 {done} / {total}', 'Saving {done} / {total}'],
  'batch.allSaved': ['已儲存全部 {n} 張 ✓', 'All {n} cards saved ✓'],
  'batch.summary': ['{n} 張待儲存', '{n} to save'],
  'batch.failed': ['{n} 張未完成', '{n} not finished'],
  'batch.newBatch': ['新一批', 'New batch'],
  'batch.toMyCards': ['查看我的卡', 'See my cards'],
  'batch.retry': ['重試未完成的', 'Retry unfinished'],
  'batch.saveAll': ['全部儲存（{n}）', 'Save all ({n})'],
  'batch.unnamed': ['未命名', 'Unnamed'],
  'batch.savedOne': ['已儲存', 'Saved'],
  'batch.partly': ['部分完成', 'Partly saved'],
  'batch.noBack': ['沒有背面', 'No back'],
  'batch.fillInto': ['填入：', 'Fill:'],
  'batch.reading': ['辨識文字中…（第一次需下載辨識引擎）', 'Reading text… (the first time downloads the engine)'],
  'batch.noText': ['認不到文字，請直接輸入，或重拍更清晰的相片。', 'No text recognised — type it in, or retake a sharper photo.'],
  'batch.selectText': ['在全文中選取文字', 'Select from the full text'],
  'batch.useSelection': ['把選取的文字填入「{field}」', 'Put the selected text into “{field}”'],
  'batch.resume': ['你有 {n} 張批次掃描的卡未儲存', 'You have {n} batch-scanned cards not saved yet'],
  'batch.resumeCta': ['繼續', 'Continue'],
  'batch.cta': ['批次掃描', 'Batch scan'],
  'batch.ctaHint': ['一張接一張拍，最多 10 張，正面和背面', 'Shoot up to 10 cards in a row, front and back'],
  // account
  'account.title': ['帳戶', 'Account'],
  'account.type.COLLECTOR': ['實體卡寄存帳戶', 'Collector account'],
  'account.type.PLAYER': ['遊戲帳戶', 'Game account'],
  'account.region': ['地區（買家會看到）', 'Region (buyers see this)'],
  'account.region.none': ['未選擇', 'Not set'],
  'account.wa.title': ['WhatsApp（賣卡需要）', 'WhatsApp (needed to sell)'],
  'account.wa.hint': ['永不公開。只在交易被接受後，向交易對方顯示。', 'Never public. Only the other side of an accepted deal sees it.'],
  'account.wa.country': ['國家／地區', 'Country'],
  'account.wa.number': ['電話號碼', 'Number'],
  'account.wa.save': ['儲存號碼', 'Save number'],
  'account.wa.clear': ['移除號碼', 'Remove number'],
  'account.wa.clearWarn': ['移除後，你的卡會即時從市場下架。確定移除？', 'Removing it takes your cards out of the market immediately. Remove it?'],
  'account.wa.current': ['目前號碼', 'Current number'],
  'account.pw.title': ['密碼', 'Password'],
  'account.pw.set': ['設定密碼', 'Set password'],
  'account.pw.change': ['更改密碼', 'Change password'],
  'account.pw.current': ['目前密碼', 'Current password'],
  'account.pw.new': ['新密碼（8–128 字元）', 'New password (8–128 characters)'],
  'account.pw.saved': ['密碼已更新', 'Password updated'],
  'account.pw.missing': ['你的帳戶未有密碼：設定後才可出售或出價，並可在其他裝置登入。', 'Your account has no password yet — set one to sell, make offers and sign in on other devices.'],
  'account.signout': ['登出', 'Sign out'],
  'account.saved': ['已儲存', 'Saved'],
  // auth
  'login.title': ['登入', 'Sign in'],
  'login.name': ['名稱', 'Name'],
  'login.password': ['密碼', 'Password'],
  'login.submit': ['登入', 'Sign in'],
  'login.noAccount': ['未有帳戶？', 'No account yet?'],
  'login.help': ['使用 Card Pool 的名稱和密碼。帳戶未設定密碼的話，請先在 Card Pool 設定。', 'Use your Card Pool name and password. If your account has no password yet, set one on Card Pool first.'],
  'signup.title': ['免費開戶', 'Create your account'],
  'signup.sub': ['實體卡寄存帳戶：記錄和出售你的實體卡。', 'A collector account to keep and sell your real cards.'],
  'signup.name': ['名稱（公開顯示，2–24 字元）', 'Name (shown publicly, 2–24 characters)'],
  'signup.name.ok': ['可以使用', 'Available'],
  'signup.name.taken': ['已被使用', 'Already taken'],
  'signup.password': ['密碼（8–128 字元）', 'Password (8–128 characters)'],
  'signup.confirm': ['再輸入密碼', 'Repeat password'],
  'signup.nameShort': ['名稱最少 2 個字元', 'Name needs at least 2 characters'],
  'signup.mismatch': ['兩次輸入的密碼不一致', 'Passwords do not match'],
  'signup.submit': ['建立帳戶', 'Create account'],
  'signup.haveAccount': ['已有帳戶？', 'Already have an account?'],
  'signup.step': ['第 {n} 步，共 2 步', 'Step {n} of 2'],
  'signup.wa.title': ['加入 WhatsApp', 'Add your WhatsApp'],
  'signup.wa.sub': ['賣卡需要 WhatsApp；買家要在你接受出價後才看到。', 'Needed to sell. Buyers only see it after you accept their offer.'],
  'signup.already': ['你已登入。', 'You are signed in.'],
  'signup.continue': ['繼續', 'Continue'],
  'signup.skip': ['稍後再說', 'Skip for now'],
  // common
  'common.loading': ['載入中…', 'Loading…'],
  'common.error': ['出錯了：{msg}', 'Something went wrong: {msg}'],
  'common.retry': ['重試', 'Try again'],
  'common.signinNeeded': ['請先登入。', 'Please sign in first.'],
  'common.justNow': ['剛剛', 'just now'],
  'common.lang': ['English', '中文'],
  'cond.MINT': ['全新 Mint', 'Mint'],
  'cond.NEAR_MINT': ['近全新 NM', 'Near mint'],
  'cond.EXCELLENT': ['極佳 EX', 'Excellent'],
  'cond.GOOD': ['良好 GD', 'Good'],
  'cond.PLAYED': ['有使用痕跡', 'Played'],
  'cond.POOR': ['較差', 'Poor'],
  'clang.en': ['英文', 'English'],
  'clang.zh': ['中文', 'Chinese'],
  'clang.ja': ['日文', 'Japanese'],
  'clang.ko': ['韓文', 'Korean'],
  'clang.other': ['其他', 'Other'],
  // errors by API code
  'err.NAME_TAKEN': ['這個名稱已被使用', 'That name is taken'],
  'err.PASSWORD_SHORT': ['密碼最少 8 個字元', 'Password needs at least 8 characters'],
  'err.PASSWORD_LONG': ['密碼最多 128 個字元', 'Password can be at most 128 characters'],
  'err.BAD_LOGIN': ['名稱或密碼不正確', 'Wrong name or password'],
  'err.LOCKED': ['嘗試次數太多，請稍後再試', 'Too many attempts — try again later'],
  'err.LOCKED_N': ['嘗試次數太多，請 {n} 分鐘後再試', 'Too many attempts — try again in {n} minutes'],
  'err.ACCOUNT_SUSPENDED': ['帳戶已被暫停', 'This account is suspended'],
  'err.WRONG_PASSWORD': ['目前密碼不正確', 'Your current password is not correct'],
  'err.NO_IMAGES': ['相片要用相片上載，不能放在卡片資料內', 'Upload photos with the photo upload, not inside the record'],
  'err.PHOTO_TYPE': ['相片必須是 JPEG、PNG 或 WebP', 'Photos must be JPEG, PNG or WebP'],
  'err.PHOTO_TOO_LARGE': ['相片太大（最多 3 MB）', 'Photo is too large (max 3 MB)'],
  'err.PAYLOAD_TOO_LARGE': ['檔案太大', 'Upload is too large'],
  'err.PHOTO_STORAGE_MISSING': ['相片儲存暫時不可用', 'Photo storage is not available right now'],
  'err.LISTED_GT_OWNED': ['出售張數不能多於擁有張數', 'Copies for sale cannot be more than copies owned'],
  'err.BAD_WHATSAPP': ['請輸入有效的 WhatsApp 號碼（香港號碼為 8 位數字）', 'Enter a valid WhatsApp number (Hong Kong numbers have 8 digits)'],
  'err.NEEDS_PRICE': ['請先設定叫價', 'Set an asking price first'],
  'err.NEEDS_FOR_SALE': ['請先設定出售張數', 'Set how many copies are for sale first'],
  'err.NEEDS_WHATSAPP': ['請先在帳戶加入 WhatsApp 號碼', 'Add your WhatsApp number in Account first'],
  'err.ACCOUNT_NOT_SECURED': ['請先為帳戶設定密碼', 'Set a password for your account first'],
  'err.REMOVED_BY_ADMIN': ['管理員已將這張卡從市場移除', 'An admin removed this card from the market'],
  'err.MARKET_CLOSED': ['玩家市場暫停中', 'The player market is closed for now'],
  'err.NOT_LISTED': ['這張卡已不在市場上', 'This card is no longer for sale'],
  'err.OWN_LISTING': ['不能對自己的卡出價', 'You can’t make an offer on your own card'],
  'err.BAD_PRICE': ['出價必須大於 0', 'Offer a price above 0'],
  'err.BAD_QUANTITY': ['張數不正確', 'Choose a valid number of copies'],
  'err.OFFER_EXISTS': ['你已對這張卡出價', 'You already have an offer on this card'],
  'err.TOO_MANY_OFFERS': ['進行中的出價太多，請先完成或撤回部分出價', 'Too many open offers — finish or withdraw some first'],
  'err.BAD_STEP': ['現在不能進行這個步驟', 'This step is not possible right now'],
  'err.DEAL_CLOSED': ['這個交易已結束', 'This deal is closed'],
  'err.CARD_GONE': ['賣家已移除這張卡', 'The card was removed from the seller’s collection'],
  'err.NOT_ENOUGH_FOR_SALE': ['可售張數不足', 'Not enough copies for sale now'],
  'err.EMPTY_MESSAGE': ['請先輸入訊息', 'Write a message first'],
  'err.AUTH': ['請先登入', 'Please sign in'],
  'err.NETWORK': ['網絡錯誤，請檢查連線', 'Network error — check your connection'],
  'err.UPSTREAM_UNAVAILABLE': ['Card Pool 暫時無法連線，請稍後再試', 'Card Pool is not reachable — try again shortly'],
  'err.DB_UNAVAILABLE': ['資料庫暫時無法使用，請稍後再試', 'Database unavailable — try again shortly'],
  'err.SERVER_ERROR': ['伺服器出錯，請稍後再試', 'Server error — please try again shortly'],
  'err.NOT_FOUND': ['找不到相關資料', 'Not found'],
  'err.CSRF': ['請在本網站內操作', 'Cross-site request refused'],
  'err.SIGNOUT_FAILED': ['未能登出，請再試一次', 'Could not sign out — please try again'],
  'err.PHOTO_UNREADABLE': ['無法讀取這張相片，請換一張（JPEG、PNG 或 WebP）', 'Could not read this photo — try another (JPEG, PNG or WebP)'],
  'err.uncoded': ['操作未能完成：{msg}', '{msg}'],
  'err.SCHEMA_OUTDATED': ['系統更新中，請稍後再試', 'Service is being updated — try again shortly'],
} satisfies Record<string, [string, string]>;

export type Key = keyof typeof D;
type Vars = Record<string, string | number>;

const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`)) : s);

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key, v?: Vars) => string;
  /** Human message for any thrown error (API code first, then the server's own words). */
  errorText: (e: unknown) => string;
  money: (amount: number | null | undefined, currency?: string) => string;
  ago: (ms: number) => string;
}

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    document.cookie = `cm_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l === 'zh' ? 'zh-Hant-HK' : 'en';
    setLangState(l);
  }, []);
  const value = useMemo<Ctx>(() => {
    const i = lang === 'zh' ? 0 : 1;
    const t = (k: Key, v?: Vars) => (D[k] ? fill(D[k][i], v) : k);
    const locale = lang === 'zh' ? 'zh-HK' : 'en-HK';
    return {
      lang, setLang, t,
      errorText: (e) => {
        if (e instanceof ApiError) {
          if (e.code === 'LOCKED') {
            const n = /(\d+)\s*minute/i.exec(e.message)?.[1]; // the server says how long the lock has left
            return n ? t('err.LOCKED_N', { n }) : t('err.LOCKED');
          }
          const key = `err.${e.code}` as Key;
          if (e.code && key in D) {
            const reason = (e.data as { reason?: string } | undefined)?.reason;
            return t(key) + (e.code === 'ACCOUNT_SUSPENDED' && reason ? `: ${reason}` : '');
          }
          if (e.status === 404) return t('err.NOT_FOUND');
          if (e.status >= 500) return t('err.SERVER_ERROR');
        }
        // Server checks without a code (and browser errors) arrive in English: frame them in the UI language.
        return t('err.uncoded', { msg: e instanceof Error ? e.message : String(e) });
      },
      money: (amount, currency = 'HKD') => {
        if (amount === null || amount === undefined) return '—';
        try {
          return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
        } catch {
          return `${currency} ${amount}`;
        }
      },
      ago: (ms) => {
        const s = Math.round((Date.now() - ms) / 1000);
        if (s < 60) return t('common.justNow');
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
        if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
        if (s < 86400 * 30) return rtf.format(-Math.floor(s / 86400), 'day');
        return new Date(ms).toLocaleDateString(locale);
      },
    };
  }, [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  const c = useContext(LangContext);
  if (!c) throw new Error('useT outside LangProvider');
  return c;
}
