/**
 * デモ用の架空データ（純粋関数）。実在の会社・人物・住所とは関係ありません。
 * 売上は乱数の種を固定して生成するため、何度 setupDemo しても同じデータになる
 * （README の請求書見本と、実際に作られる請求書が一致する）。
 */

const DEMO_SEED = 20260901;
const DEMO_FROM = "2026-07-01";
const DEMO_TO = "2026-09-30";

/** 取引先マスタの行（CONFIG.HEADERS.CUSTOMERS の順） */
function demoCustomerRows(): (string | number)[][] {
  return [
    ["C001", "カフェ見本 駅前店", "御中", "000-0001", "架空県見本市駅前町1-1", "見本 一郎", 0.8, "末日", "翌月", "末日", "四捨五入", "切り捨て"],
    ["C002", "見本ベーカリー株式会社", "御中", "000-0002", "架空県見本市麦畑2-2-2", "試作 二郎", 0.85, "20日", "翌月", "10日", "切り捨て", "切り捨て"],
    ["C003", "レストラン架空亭", "御中", "000-0003", "架空県見本市港町3-3", "", 0.9, "末日", "翌月", "25日", "切り上げ", "四捨五入"],
    ["C004", "株式会社デモ弁当", "御中", "000-0004", "架空県見本市工場通り4-4-4", "仮名 三郎", 0.78, "15日", "当月", "末日", "切り捨て", "切り捨て"],
    ["C005", "見本 花子", "様", "000-0005", "架空県見本市緑町5-5", "", 0.95, "末日", "翌月", "末日", "四捨五入", "四捨五入"],
  ];
}

/** 商品マスタの行（CONFIG.HEADERS.PRODUCTS の順）。食品は軽減8%、資材・配送料は標準10% */
function demoProductRows(): (string | number)[][] {
  return [
    ["P001", "牛乳 1L", "本", 220, "軽減8%"],
    ["P002", "無塩バター 450g", "個", 980, "軽減8%"],
    ["P003", "強力粉 25kg", "袋", 6480, "軽減8%"],
    ["P004", "グラニュー糖 1kg", "袋", 298, "軽減8%"],
    ["P005", "鶏卵 10kg", "箱", 4350, "軽減8%"],
    ["P006", "コーヒー豆 1kg", "袋", 2780, "軽減8%"],
    ["P007", "オリーブオイル 1L", "本", 1580, "軽減8%"],
    ["P008", "鶏むね肉（冷蔵）", "kg", 698, "軽減8%"],
    ["P009", "紙ナプキン 1000枚", "箱", 1180, "標準10%"],
    ["P010", "テイクアウト容器 50個", "袋", 1320, "標準10%"],
    ["P011", "業務用洗剤 4L", "本", 1980, "標準10%"],
    ["P012", "食品用ラップ 30cm", "本", 435, "標準10%"],
    ["P013", "配送料", "回", 800, "標準10%"],
  ];
}

interface DemoSale {
  date: string;
  slipNo: string;
  customerName: string;
  productName: string;
  quantity: number;
  specialPrice: number | null;
  note: string;
}

/** 種を固定した乱数（mulberry32） */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 取引先ごとの注文傾向: [取引先名, 注文する確率/営業日, [商品名, 最小数量, 最大数量][], 注文しない月] */
type DemoProfile = [string, number, [string, number, number][], string[]];

function demoProfiles(): DemoProfile[] {
  return [
    ["カフェ見本 駅前店", 0.35, [["牛乳 1L", 6, 24], ["無塩バター 450g", 1, 4], ["グラニュー糖 1kg", 1, 5], ["コーヒー豆 1kg", 1, 4], ["紙ナプキン 1000枚", 1, 2], ["テイクアウト容器 50個", 1, 3]], []],
    ["見本ベーカリー株式会社", 0.4, [["強力粉 25kg", 1, 3], ["無塩バター 450g", 2, 8], ["グラニュー糖 1kg", 2, 6], ["鶏卵 10kg", 1, 2], ["牛乳 1L", 4, 12], ["食品用ラップ 30cm", 1, 3]], []],
    ["レストラン架空亭", 0.3, [["オリーブオイル 1L", 1, 4], ["鶏むね肉（冷蔵）", 2, 8], ["鶏卵 10kg", 1, 1], ["無塩バター 450g", 1, 3], ["業務用洗剤 4L", 1, 2]], []],
    ["株式会社デモ弁当", 0.45, [["鶏むね肉（冷蔵）", 5, 15], ["鶏卵 10kg", 1, 2], ["テイクアウト容器 50個", 2, 6], ["食品用ラップ 30cm", 1, 4], ["業務用洗剤 4L", 1, 1]], []],
    // 個人のお客様。8月は注文なし（一括作成で「対象の売上なし」としてスキップされる例）
    ["見本 花子", 0.08, [["コーヒー豆 1kg", 1, 2], ["鶏むね肉（冷蔵）", 1, 3], ["テイクアウト容器 50個", 1, 2]], ["2026-08"]],
  ];
}

/** デモの売上（営業日=月〜土に、取引先ごとに確率で注文が入る） */
function demoSales(): DemoSale[] {
  const random = createRandom(DEMO_SEED);
  const pick = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const sales: DemoSale[] = [];
  let slip = 1;
  const nextSlip = () => `S${String(slip++).padStart(5, "0")}`;

  for (let date = DEMO_FROM; date <= DEMO_TO; date = addDays(date, 1)) {
    const { year, month, day } = parseYmd(date);
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) continue; // 日曜休み
    demoProfiles().forEach(([customerName, probability, items, skipMonths]) => {
      if (random() >= probability || skipMonths.indexOf(date.slice(0, 7)) >= 0) return;
      const slipNo = nextSlip();
      const count = pick(1, Math.min(3, items.length));
      const chosen: number[] = [];
      while (chosen.length < count) {
        const i = pick(0, items.length - 1);
        if (chosen.indexOf(i) < 0) chosen.push(i);
      }
      chosen.sort((a, b) => a - b);
      chosen.forEach((i) => {
        const [productName, min, max] = items[i];
        sales.push({ date, slipNo, customerName, productName, quantity: pick(min, max), specialPrice: null, note: "" });
      });
      // 少量の注文には配送料
      if (count === 1 && random() < 0.5) {
        sales.push({ date, slipNo, customerName, productName: "配送料", quantity: 1, specialPrice: null, note: "" });
      }
    });
  }

  // 計算の見どころになる行を固定で追加
  const extra = (date: string, customerName: string, productName: string, quantity: number, specialPrice: number | null, note: string) =>
    sales.push({ date, slipNo: nextSlip(), customerName, productName, quantity, specialPrice, note });
  extra("2026-09-20", "見本ベーカリー株式会社", "強力粉 25kg", 2, null, "締め日当日→9月分");
  extra("2026-09-21", "見本ベーカリー株式会社", "強力粉 25kg", 1, null, "締め日翌日→10月分");
  extra("2026-09-12", "見本ベーカリー株式会社", "無塩バター 450g", -2, null, "返品");
  extra("2026-09-10", "レストラン架空亭", "オリーブオイル 1L", 6, 1400, "特価");
  extra("2026-09-17", "レストラン架空亭", "鶏むね肉（冷蔵）", 2.5, null, "量り売り");

  return sales.sort((a, b) => (a.date === b.date ? (a.slipNo < b.slipNo ? -1 : 1) : a.date < b.date ? -1 : 1));
}

if (typeof module !== "undefined") {
  module.exports = {
    DEMO_SEED,
    DEMO_FROM,
    DEMO_TO,
    demoCustomerRows,
    demoProductRows,
    createRandom,
    demoProfiles,
    demoSales,
  };
}
