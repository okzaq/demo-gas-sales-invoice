/**
 * テスト用のデータ作成ヘルパー。上書きしたい項目だけ渡す。
 */
export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    code: "C900",
    name: "テスト商店",
    honorific: "御中",
    postalCode: "000-0000",
    address: "架空県見本市1-1",
    contact: "",
    rate: 0.85,
    closingDay: "end",
    paymentMonthOffset: 1,
    paymentDay: "end",
    priceRounding: "floor",
    taxRounding: "floor",
    ...overrides,
  };
}

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    code: "P900",
    name: "テスト商品",
    unit: "個",
    price: 1000,
    taxRate: 8,
    reduced: true,
    ...overrides,
  };
}

let rowCounter = 100;

export function makeSale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    rowNumber: rowCounter++,
    date: "2026-09-10",
    slipNo: "S00001",
    customerName: "テスト商店",
    productName: "テスト商品",
    quantity: 1,
    specialPrice: null,
    note: "",
    ...overrides,
  };
}

/** 税率と金額だけ決めた明細（税計算・請求書のテスト用） */
export function makeLine(overrides: Partial<PricedLine> = {}): PricedLine {
  return {
    rowNumber: rowCounter++,
    date: "2026-09-10",
    slipNo: "S00001",
    customerCode: "C900",
    customerName: "テスト商店",
    productCode: "P900",
    productName: "テスト商品",
    unit: "個",
    quantity: 1,
    unitPrice: 1000,
    amount: 1000,
    taxRate: 8,
    reduced: true,
    note: "",
    ...overrides,
  };
}

/** Jest 実行マシンのタイムゾーンに依存しない日付フォーマッタ（テストでは Date を UTC で作る） */
export function utcFormatter(d: Date): string {
  return d.toISOString().slice(0, 10);
}
