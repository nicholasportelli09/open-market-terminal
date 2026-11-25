/**
 * Home-market listings of large Asian companies, with English names and common aliases.
 *
 * Why: CNBC's symbol search returns at most ~11 matches and fills them with Frankfurt, London and US OTC
 * copies, so the home listing (Tokyo, Hong Kong, Shanghai, Shenzhen, Taipei) often never appears; and
 * Korean shares come from Naver, whose search only understands Korean names and codes. Every symbol here
 * was checked against the live feed on 2026-11-24.
 *
 * Symbols use the app's CNBC-style form: "7203.T-JP", "700-HK", "600519-CN", "2330-TW", and "005930-KR"
 * for Korea (served by Naver Finance).
 */
export type AsiaListing = { symbol: string; name: string; aliases?: string[] };

export const ASIA_LISTINGS: readonly AsiaListing[] = [
  // South Korea (KRX: KOSPI and KOSDAQ)
  { symbol: "005930-KR", name: "Samsung Electronics", aliases: ["samsung"] },
  { symbol: "000660-KR", name: "SK hynix", aliases: ["hynix", "sk hynix"] },
  { symbol: "373220-KR", name: "LG Energy Solution", aliases: ["lges"] },
  { symbol: "207940-KR", name: "Samsung Biologics" },
  { symbol: "005380-KR", name: "Hyundai Motor", aliases: ["hyundai"] },
  { symbol: "000270-KR", name: "Kia" },
  { symbol: "068270-KR", name: "Celltrion" },
  { symbol: "035420-KR", name: "NAVER" },
  { symbol: "035720-KR", name: "Kakao" },
  { symbol: "005490-KR", name: "POSCO Holdings", aliases: ["posco"] },
  { symbol: "051910-KR", name: "LG Chem" },
  { symbol: "006400-KR", name: "Samsung SDI" },
  { symbol: "105560-KR", name: "KB Financial Group" },
  { symbol: "055550-KR", name: "Shinhan Financial Group", aliases: ["shinhan"] },
  { symbol: "012330-KR", name: "Hyundai Mobis" },
  { symbol: "028260-KR", name: "Samsung C&T" },
  { symbol: "066570-KR", name: "LG Electronics" },
  { symbol: "003550-KR", name: "LG Corp" },
  { symbol: "032830-KR", name: "Samsung Life Insurance" },
  { symbol: "086790-KR", name: "Hana Financial Group" },
  { symbol: "015760-KR", name: "Korea Electric Power", aliases: ["kepco"] },
  { symbol: "017670-KR", name: "SK Telecom" },
  { symbol: "030200-KR", name: "KT Corp" },
  { symbol: "034730-KR", name: "SK Inc" },
  { symbol: "096770-KR", name: "SK Innovation" },
  { symbol: "009150-KR", name: "Samsung Electro-Mechanics" },
  { symbol: "018260-KR", name: "Samsung SDS" },
  { symbol: "010130-KR", name: "Korea Zinc" },
  { symbol: "012450-KR", name: "Hanwha Aerospace", aliases: ["hanwha"] },
  { symbol: "042660-KR", name: "Hanwha Ocean" },
  { symbol: "329180-KR", name: "HD Hyundai Heavy Industries" },
  { symbol: "009540-KR", name: "HD Korea Shipbuilding & Offshore Engineering", aliases: ["ksoe"] },
  { symbol: "267260-KR", name: "HD Hyundai Electric" },
  { symbol: "034020-KR", name: "Doosan Enerbility", aliases: ["doosan"] },
  { symbol: "011200-KR", name: "HMM" },
  { symbol: "259960-KR", name: "Krafton" },
  { symbol: "036570-KR", name: "NCSoft" },
  { symbol: "251270-KR", name: "Netmarble" },
  { symbol: "352820-KR", name: "HYBE" },
  { symbol: "323410-KR", name: "KakaoBank" },
  { symbol: "377300-KR", name: "KakaoPay" },
  { symbol: "316140-KR", name: "Woori Financial Group" },
  { symbol: "024110-KR", name: "Industrial Bank of Korea" },
  { symbol: "033780-KR", name: "KT&G" },
  { symbol: "090430-KR", name: "Amorepacific" },
  { symbol: "010950-KR", name: "S-Oil" },
  { symbol: "000810-KR", name: "Samsung Fire & Marine Insurance" },
  { symbol: "011170-KR", name: "Lotte Chemical", aliases: ["lotte"] },
  { symbol: "003670-KR", name: "POSCO Future M" },
  { symbol: "064350-KR", name: "Hyundai Rotem" },
  { symbol: "079550-KR", name: "LIG Defense & Aerospace", aliases: ["lig nex1"] },
  { symbol: "042700-KR", name: "Hanmi Semiconductor" },
  { symbol: "000100-KR", name: "Yuhan" },
  { symbol: "128940-KR", name: "Hanmi Pharm" },
  { symbol: "006800-KR", name: "Mirae Asset Securities" },
  { symbol: "247540-KR", name: "EcoPro BM" },
  { symbol: "086520-KR", name: "EcoPro" },
  { symbol: "196170-KR", name: "Alteogen" },
  { symbol: "028300-KR", name: "HLB" },
  { symbol: "041510-KR", name: "SM Entertainment" },
  { symbol: "035900-KR", name: "JYP Entertainment" },
  { symbol: "263750-KR", name: "Pearl Abyss" },

  // Japan (Tokyo Stock Exchange)
  { symbol: "7203.T-JP", name: "Toyota Motor", aliases: ["toyota"] },
  { symbol: "9984.T-JP", name: "SoftBank Group", aliases: ["softbank"] },
  { symbol: "9434.T-JP", name: "SoftBank Corp", aliases: ["softbank"] },
  { symbol: "6758.T-JP", name: "Sony Group", aliases: ["sony"] },
  { symbol: "6861.T-JP", name: "Keyence" },
  { symbol: "8306.T-JP", name: "Mitsubishi UFJ Financial Group", aliases: ["mufg"] },
  { symbol: "9983.T-JP", name: "Fast Retailing", aliases: ["uniqlo"] },
  { symbol: "6098.T-JP", name: "Recruit Holdings" },
  { symbol: "8035.T-JP", name: "Tokyo Electron" },
  { symbol: "9432.T-JP", name: "NTT", aliases: ["nippon telegraph"] },
  { symbol: "9433.T-JP", name: "KDDI" },
  { symbol: "7974.T-JP", name: "Nintendo" },
  { symbol: "6501.T-JP", name: "Hitachi" },
  { symbol: "4063.T-JP", name: "Shin-Etsu Chemical" },
  { symbol: "8316.T-JP", name: "Sumitomo Mitsui Financial Group", aliases: ["smfg"] },
  { symbol: "8411.T-JP", name: "Mizuho Financial Group" },
  { symbol: "7267.T-JP", name: "Honda Motor", aliases: ["honda"] },
  { symbol: "6902.T-JP", name: "Denso" },
  { symbol: "8058.T-JP", name: "Mitsubishi Corp" },
  { symbol: "8001.T-JP", name: "Itochu" },
  { symbol: "8031.T-JP", name: "Mitsui & Co" },
  { symbol: "4502.T-JP", name: "Takeda Pharmaceutical", aliases: ["takeda"] },
  { symbol: "6367.T-JP", name: "Daikin Industries" },
  { symbol: "6981.T-JP", name: "Murata Manufacturing" },
  { symbol: "6954.T-JP", name: "Fanuc" },
  { symbol: "7741.T-JP", name: "Hoya" },
  { symbol: "4519.T-JP", name: "Chugai Pharmaceutical" },
  { symbol: "6857.T-JP", name: "Advantest" },
  { symbol: "6146.T-JP", name: "Disco" },
  { symbol: "6723.T-JP", name: "Renesas Electronics" },
  { symbol: "7011.T-JP", name: "Mitsubishi Heavy Industries" },
  { symbol: "6702.T-JP", name: "Fujitsu" },
  { symbol: "6503.T-JP", name: "Mitsubishi Electric" },
  { symbol: "4568.T-JP", name: "Daiichi Sankyo" },
  { symbol: "2914.T-JP", name: "Japan Tobacco" },
  { symbol: "7751.T-JP", name: "Canon" },
  { symbol: "6752.T-JP", name: "Panasonic" },
  { symbol: "7201.T-JP", name: "Nissan Motor", aliases: ["nissan"] },
  { symbol: "8766.T-JP", name: "Tokio Marine" },
  { symbol: "4661.T-JP", name: "Oriental Land" },
  { symbol: "3382.T-JP", name: "Seven & i Holdings", aliases: ["7-eleven", "seven eleven"] },
  { symbol: "6273.T-JP", name: "SMC Corp" },
  { symbol: "9201.T-JP", name: "Japan Airlines" },
  { symbol: "5401.T-JP", name: "Nippon Steel" },
  { symbol: "6594.T-JP", name: "Nidec" },
  { symbol: "7832.T-JP", name: "Bandai Namco" },
  { symbol: "9697.T-JP", name: "Capcom" },
  { symbol: "8604.T-JP", name: "Nomura Holdings", aliases: ["nomura"] },
  { symbol: "6920.T-JP", name: "Lasertec" },
  { symbol: "7733.T-JP", name: "Olympus" },
  { symbol: "4689.T-JP", name: "LY Corp", aliases: ["line yahoo", "yahoo japan"] },

  // Hong Kong (HKEX)
  { symbol: "700-HK", name: "Tencent Holdings", aliases: ["tencent"] },
  { symbol: "9988-HK", name: "Alibaba Group", aliases: ["alibaba"] },
  { symbol: "3690-HK", name: "Meituan" },
  { symbol: "1810-HK", name: "Xiaomi" },
  { symbol: "9618-HK", name: "JD.com", aliases: ["jd"] },
  { symbol: "1211-HK", name: "BYD (Hong Kong)", aliases: ["byd"] },
  { symbol: "941-HK", name: "China Mobile" },
  { symbol: "1299-HK", name: "AIA Group" },
  { symbol: "5-HK", name: "HSBC Holdings (Hong Kong)", aliases: ["hsbc"] },
  { symbol: "388-HK", name: "Hong Kong Exchanges and Clearing", aliases: ["hkex"] },
  { symbol: "2318-HK", name: "Ping An Insurance (Hong Kong)", aliases: ["ping an"] },
  { symbol: "939-HK", name: "China Construction Bank (Hong Kong)" },
  { symbol: "1398-HK", name: "ICBC (Hong Kong)", aliases: ["industrial and commercial bank of china"] },
  { symbol: "3988-HK", name: "Bank of China (Hong Kong)" },
  { symbol: "9999-HK", name: "NetEase" },
  { symbol: "9888-HK", name: "Baidu" },
  { symbol: "2015-HK", name: "Li Auto" },
  { symbol: "9868-HK", name: "XPeng" },
  { symbol: "9866-HK", name: "NIO" },
  { symbol: "1024-HK", name: "Kuaishou" },
  { symbol: "883-HK", name: "CNOOC" },
  { symbol: "2020-HK", name: "Anta Sports" },
  { symbol: "27-HK", name: "Galaxy Entertainment" },
  { symbol: "16-HK", name: "Sun Hung Kai Properties" },
  { symbol: "1-HK", name: "CK Hutchison" },
  { symbol: "981-HK", name: "SMIC (Hong Kong)", aliases: ["semiconductor manufacturing international"] },
  { symbol: "992-HK", name: "Lenovo Group", aliases: ["lenovo"] },
  { symbol: "9961-HK", name: "Trip.com" },
  { symbol: "669-HK", name: "Techtronic Industries" },
  { symbol: "175-HK", name: "Geely Automobile", aliases: ["geely"] },
  { symbol: "2269-HK", name: "WuXi Biologics" },
  { symbol: "9633-HK", name: "Nongfu Spring" },
  { symbol: "3750-HK", name: "CATL (Hong Kong)", aliases: ["contemporary amperex"] },

  // Mainland China (Shanghai and Shenzhen A-shares)
  { symbol: "600519-CN", name: "Kweichow Moutai", aliases: ["moutai"] },
  { symbol: "300750-CN", name: "CATL (Shenzhen)", aliases: ["catl", "contemporary amperex"] },
  { symbol: "002594-CN", name: "BYD (Shenzhen)", aliases: ["byd"] },
  { symbol: "601318-CN", name: "Ping An Insurance (Shanghai)", aliases: ["ping an"] },
  { symbol: "600036-CN", name: "China Merchants Bank" },
  { symbol: "601398-CN", name: "ICBC (Shanghai)", aliases: ["industrial and commercial bank of china"] },
  { symbol: "601288-CN", name: "Agricultural Bank of China" },
  { symbol: "601939-CN", name: "China Construction Bank (Shanghai)" },
  { symbol: "601988-CN", name: "Bank of China (Shanghai)" },
  { symbol: "600900-CN", name: "China Yangtze Power" },
  { symbol: "000858-CN", name: "Wuliangye Yibin", aliases: ["wuliangye"] },
  { symbol: "000333-CN", name: "Midea Group", aliases: ["midea"] },
  { symbol: "601012-CN", name: "LONGi Green Energy", aliases: ["longi"] },
  { symbol: "002415-CN", name: "Hikvision" },
  { symbol: "000651-CN", name: "Gree Electric" },
  { symbol: "601857-CN", name: "PetroChina" },
  { symbol: "600028-CN", name: "Sinopec" },
  { symbol: "601899-CN", name: "Zijin Mining" },
  { symbol: "600030-CN", name: "CITIC Securities" },
  { symbol: "002475-CN", name: "Luxshare Precision", aliases: ["luxshare"] },
  { symbol: "601088-CN", name: "China Shenhua Energy" },
  { symbol: "300059-CN", name: "East Money Information", aliases: ["eastmoney"] },
  { symbol: "601127-CN", name: "Seres Group" },

  // Taiwan (TWSE)
  { symbol: "2330-TW", name: "TSMC", aliases: ["taiwan semiconductor"] },
  { symbol: "2317-TW", name: "Hon Hai Precision", aliases: ["foxconn"] },
  { symbol: "2454-TW", name: "MediaTek" },
  { symbol: "2308-TW", name: "Delta Electronics" },
  { symbol: "2382-TW", name: "Quanta Computer" },
  { symbol: "2412-TW", name: "Chunghwa Telecom" },
  { symbol: "2881-TW", name: "Fubon Financial" },
  { symbol: "2882-TW", name: "Cathay Financial" },
  { symbol: "2303-TW", name: "United Microelectronics", aliases: ["umc"] },
  { symbol: "3711-TW", name: "ASE Technology" },
  { symbol: "2357-TW", name: "Asustek", aliases: ["asus"] },
  { symbol: "2603-TW", name: "Evergreen Marine" },
  { symbol: "3008-TW", name: "Largan Precision" },
  { symbol: "3231-TW", name: "Wistron" },
  { symbol: "2345-TW", name: "Accton Technology" },
  { symbol: "6669-TW", name: "Wiwynn" },
  { symbol: "3661-TW", name: "Alchip Technologies" },
  { symbol: "2379-TW", name: "Realtek" },
];

const BY_SYMBOL = new Map(ASIA_LISTINGS.map((l) => [l.symbol, l]));

export function asiaListing(symbol: string): AsiaListing | undefined {
  return BY_SYMBOL.get(symbol);
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Match strength: 3 exact name or alias, 2 name or alias starts with the query, 1 a later word does. */
export type ScoredListing = { listing: AsiaListing; score: 1 | 2 | 3 };

/** Listings whose name or alias, or a word in it, starts with the query; best first. */
export function matchAsiaListings(query: string, limit = 6): ScoredListing[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: ScoredListing[] = [];
  for (const l of ASIA_LISTINGS) {
    const terms = [l.name, ...(l.aliases ?? [])].map(norm);
    let score: 0 | 1 | 2 | 3 = 0;
    for (const t of terms) {
      const s = t === q ? 3 : t.startsWith(q) ? 2 : q.length >= 3 && ` ${t}`.includes(` ${q}`) ? 1 : 0;
      // Same comparison with spaces dropped, so "skhynix" finds "SK hynix" (exact or prefix only).
      const qs = q.replace(/ /g, "");
      const ts = t.replace(/ /g, "");
      const loose = qs.length >= 4 ? (ts === qs ? 3 : ts.startsWith(qs) ? 2 : 0) : 0;
      score = Math.max(score, s, loose) as 0 | 1 | 2 | 3;
    }
    if (score !== 0) scored.push({ listing: l, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
