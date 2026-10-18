import { describe, expect, it } from 'vitest';
import { fixEmailText, parseCard, type Line } from '../lib/bizcard';
import { formatPhone, toE164, waLink } from '../lib/phone';
import { cardText, fill, unfilled } from '../lib/template';
import { splitName, toVCard } from '../lib/vcard';

const L = (rows: [string, number?][]): Line[] => rows.map(([text, h]) => ({ text, h: h ?? 0.04 }));

describe('phone', () => {
  it('reads Hong Kong numbers', () => {
    expect(toE164('9123 4567')).toBe('+85291234567');
    expect(toE164('+852 9123 4567')).toBe('+85291234567');
    expect(toE164('(852) 2345-6789')).toBe('+85223456789');
    expect(toE164('852-9123-4567')).toBe('+85291234567');
    expect(toE164('00852 91234567')).toBe('+85291234567');
  });
  it('reads mainland, Taiwan and Japan mobiles', () => {
    expect(toE164('138 1234 5678')).toBe('+8613812345678');
    expect(toE164('0912 345 678')).toBe('+886912345678');
    expect(toE164('090-1234-5678')).toBe('+819012345678');
  });
  it('rejects junk', () => {
    expect(toE164('12')).toBeNull();
    expect(toE164('1234 5678')).toBeNull(); // HK numbers don't start with 1
  });
  it('formats', () => {
    expect(formatPhone('+85291234567')).toBe('+852 9123 4567');
    expect(formatPhone('+8613812345678')).toBe('+86 138 1234 5678');
  });
  it('encodes WhatsApp text', () => {
    expect(waLink('+85291234567', '你好 👋\n第二行')).toBe(`https://wa.me/85291234567?text=${encodeURIComponent('你好 👋\n第二行')}`);
    expect(waLink(null, 'hi')).toBe('https://wa.me/?text=hi');
  });
});

describe('bizcard', () => {
  it('parses an English card', () => {
    const p = parseCard([L([
      ['ABC Trading Limited', 0.05],
      ['Peter Chan', 0.09],
      ['Sales Manager', 0.04],
      ['T: (852) 2345 6789   F: (852) 2345 6780', 0.03],
      ['M: 9123 4567', 0.03],
      ['E: peter@abc.com.hk', 0.03],
      ['www.abc.com.hk', 0.03],
      ['10/F, 123 Kwun Tong Road,', 0.03],
      ['Kowloon, Hong Kong', 0.03],
    ])]);
    expect(p.fields.nameEn?.value).toBe('Peter Chan');
    expect(p.fields.titleEn?.value).toBe('Sales Manager');
    expect(p.fields.companyEn?.value).toBe('ABC Trading Limited');
    expect(p.emails).toEqual(['peter@abc.com.hk']);
    expect(p.fields.website?.value).toBe('www.abc.com.hk');
    expect(p.fields.address?.value).toContain('Kwun Tong Road');
    expect(p.fields.address?.value).toContain('Kowloon');
    const byNum = Object.fromEntries(p.phones.map((x) => [x.e164, x]));
    expect(byNum['+85223456789'].kind).toBe('OFFICE');
    expect(byNum['+85223456780'].kind).toBe('FAX');
    expect(byNum['+85223456780'].whatsapp).toBe(false);
    expect(byNum['+85291234567'].kind).toBe('MOBILE');
    expect(byNum['+85291234567'].whatsapp).toBe(true);
    expect(p.language).toBe('en');
  });

  it('parses a Chinese card', () => {
    const p = parseCard([L([
      ['陳大文', 0.1],
      ['銷售經理', 0.04],
      ['ABC 有限公司', 0.05],
      ['手機：9123 4567', 0.03],
      ['電話：2345 6789', 0.03],
      ['香港九龍觀塘道123號10樓', 0.03],
    ])]);
    expect(p.fields.nameZh?.value).toBe('陳大文');
    expect(p.fields.title?.value).toBe('銷售經理');
    expect(p.fields.company?.value).toBe('ABC 有限公司');
    expect(p.fields.address?.value).toBe('香港九龍觀塘道123號10樓');
    expect(p.phones.find((x) => x.e164 === '+85223456789')?.kind).toBe('OFFICE');
    expect(p.language).toBe('zh');
  });

  it('merges a bilingual card (Chinese front, English back) and de-duplicates', () => {
    const p = parseCard([
      L([['陳大文', 0.1], ['銷售經理', 0.04], ['ABC有限公司', 0.05], ['手機 9123 4567', 0.03], ['peter@abc.com.hk', 0.03]]),
      L([['Peter Chan', 0.09], ['Sales Manager', 0.04], ['ABC Limited', 0.05], ['M +852 9123 4567', 0.03], ['Email: Peter@ABC.com.hk', 0.03]]),
    ]);
    expect(p.fields.nameZh?.value).toBe('陳大文');
    expect(p.fields.nameEn?.value).toBe('Peter Chan');
    expect(p.fields.company?.value).toBe('ABC有限公司');
    expect(p.fields.companyEn?.value).toBe('ABC Limited');
    expect(p.phones).toHaveLength(1);
    expect(p.emails).toEqual(['peter@abc.com.hk']);
  });

  it('handles mixed lines and mainland numbers', () => {
    const p = parseCard([L([['李小明 Michael Lee', 0.09], ['總監 Director', 0.04], ['深圳科技有限公司', 0.05], ['手機 138 1234 5678', 0.03]])]);
    expect(p.fields.nameZh?.value).toBe('李小明');
    expect(p.fields.nameEn?.value).toBe('Michael Lee');
    expect(p.fields.title?.value).toBe('總監');
    expect(p.fields.titleEn?.value).toBe('Director');
    expect(p.phones[0]).toMatchObject({ e164: '+8613812345678', kind: 'MOBILE' });
  });

  it('fixes OCR slips in e-mails', () => {
    expect(fixEmailText('peter (at) abc,com')).toBe('peter@abc.com');
    const p = parseCard([L([['Email: mary @ xyz . com', 0.03]])]);
    expect(p.emails).toEqual(['mary@xyz.com']);
  });

  it('does not take the company as the name', () => {
    const p = parseCard([L([['Golden Dragon Holdings', 0.1], ['Mary Wong', 0.06]])]);
    expect(p.fields.nameEn?.value).toBe('Mary Wong');
    expect(p.fields.companyEn?.value).toBe('Golden Dragon Holdings');
  });

  it('reads a Japanese card', () => {
    const p = parseCard([L([['株式会社サンプル', 0.05], ['営業部 部長', 0.04], ['山田太郎', 0.1], ['TEL 03-1234-5678', 0.03], ['携帯 090-1234-5678', 0.03]])], '81');
    expect(p.fields.company?.value).toBe('株式会社サンプル');
    expect(p.fields.nameZh?.value).toBe('山田太郎');
    expect(p.phones.find((x) => x.e164 === '+819012345678')?.kind).toBe('MOBILE');
    expect(p.phones.find((x) => x.e164 === '+81312345678')?.kind).toBe('OFFICE');
  });
});

describe('splitScripts', () => {
  it('splits mixed lines', async () => {
    const { splitScripts } = await import('../lib/bizcard');
    expect(splitScripts('ABC 有限公司 ABC Limited')).toEqual({ zh: 'ABC 有限公司', en: 'ABC Limited' });
    expect(splitScripts('陳大文 Peter Chan')).toEqual({ zh: '陳大文', en: 'Peter Chan' });
    expect(splitScripts('Peter Chan 陳大文')).toEqual({ zh: '陳大文', en: 'Peter Chan' });
    expect(splitScripts('ABC 有限公司')).toEqual({ zh: 'ABC 有限公司', en: '' });
  });
});

describe('vcard', () => {
  it('writes vCard 3.0 with escapes and CRLF', () => {
    const v = toVCard({
      nameZh: '陳大文', nameEn: 'Peter Chan', title: '銷售經理', titleEn: 'Sales Manager', company: 'ABC; 有限公司', companyEn: 'ABC Limited',
      address: '10/F, 123 Road', website: 'www.abc.com', notes: 'line1\nline2',
      phones: [{ kind: 'MOBILE', e164: '+85291234567', raw: '', whatsapp: true, isPrimary: true }, { kind: 'FAX', e164: '+85223456780', raw: '', whatsapp: false, isPrimary: false }],
      emails: [{ email: 'peter@abc.com', isPrimary: true }],
    });
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\nN:Chan;Peter;;;\r\nFN:陳大文 Peter Chan\r\n')).toBe(true);
    expect(v).toContain('ORG:ABC\\; 有限公司');
    expect(v).toContain('TEL;TYPE=CELL,PREF:+85291234567');
    expect(v).toContain('TEL;TYPE=FAX:+85223456780');
    expect(v).toContain('ADR;TYPE=WORK:;;10/F\\, 123 Road;;;;');
    expect(v).toContain('URL:https://www.abc.com');
    expect(v).toContain('NOTE:ABC Limited\\nline1\\nline2');
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
    expect(v.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });
  it('splits names', () => {
    expect(splitName('陳大文', '')).toEqual({ family: '陳', given: '大文' });
    expect(splitName('', 'CHAN Tai Man')).toEqual({ family: 'CHAN', given: 'Tai Man' });
  });
});

describe('templates', () => {
  it('fills variables and flags missing ones', () => {
    const r = fill('Hi {{name}} at {{company}} — {{unknown}}', { name: 'Peter', company: '' });
    expect(r.text).toBe('Hi Peter at {{company}} — {{unknown}}');
    expect(r.missing).toEqual(['company']);
    expect(unfilled(r.text)).toEqual(['company']);
  });
  it('writes the text card', () => {
    const t = cardText({ nameZh: '陳大文', nameEn: 'Peter Chan', title: '銷售經理', titleEn: 'Sales Manager', company: 'ABC 有限公司', companyEn: 'ABC Limited', website: 'www.abc.com.hk', address: '香港', phones: [{ kind: 'MOBILE', e164: '+85291234567', raw: '', whatsapp: true, isPrimary: true }], emails: [{ email: 'peter@abc.com.hk', isPrimary: true }] });
    expect(t).toBe('陳大文 Peter Chan\n銷售經理 Sales Manager\nABC 有限公司 ABC Limited\n📱 +852 9123 4567\n✉️ peter@abc.com.hk\n🌐 www.abc.com.hk\n📍 香港');
  });
});
