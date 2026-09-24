// Each statement below MUST be flagged by the corresponding custom rule.
declare function globalAccountsState(): void;
declare function globalPerpEngineState(): void;
declare const client: { getAccountResource: () => void };
declare function canonicalAptosAddress(address: string): string;
declare function addressComparisonKey(address: string): string;
declare const entry: { accountAddress: string };
declare const user: { accountAddress: string };
declare const row: { subaccount_address: string };
declare const PLACEHOLDER_ID: string;
declare const ADMIN_ADDRESS: string;
declare const placeholders: { PLACEHOLDER_ID: string };
declare const addresses: string[];
declare const markets: string[];
declare const marketAddress: string;
declare const label: string;
declare function addressesEqual(a: string, b: string): boolean;
declare const m: { market_addr: string };
declare const x: { owner: string };
declare const marketAddr: string;
declare const subaccountAddr: string;
declare const addr: string;
declare const other: string;
declare const ladder: string;

export function violations(): void {
  globalAccountsState();
  globalPerpEngineState();
  client.getAccountResource();
  void (entry.accountAddress !== user.accountAddress);
  void (ADMIN_ADDRESS === user.accountAddress);
  // An address-shaped literal is the padding bug, not a sentinel.
  void (entry.accountAddress === "0xa");
  // Canonical on one side only never matches a short-form address.
  void (addressComparisonKey(entry.accountAddress) === user.accountAddress);
  // Membership tests are the same bug with a different AST shape.
  void addresses.includes(user.accountAddress);
  void markets.includes(marketAddress);
  // Abbreviated `addr` names carry the same padding risk.
  void (m.market_addr === marketAddr);
  void (addr === other);
  void (subaccountAddr !== x.owner);
}

export function canonicalized(): boolean {
  return canonicalAptosAddress(entry.accountAddress) === canonicalAptosAddress(user.accountAddress);
}

export function comparisonKeyed(): boolean {
  return addressComparisonKey(entry.accountAddress) === addressComparisonKey(user.accountAddress);
}

// The repo hoists the key out of the loop; that is still a canonical compare.
export function hoistedKey(): boolean {
  const wanted = addressComparisonKey(marketAddress);
  return addressComparisonKey(entry.accountAddress) === wanted;
}

export function placeholderSentinel(): boolean {
  return (
    row.subaccount_address === PLACEHOLDER_ID ||
    row.subaccount_address === placeholders.PLACEHOLDER_ID
  );
}

// Not an address, so neither the compare nor the membership test should report.
export function unrelatedStrings(): boolean {
  return label === "pending" || markets.includes(label) || ladder === other;
}

export function canonicalizedAddr(): boolean {
  const key = addressComparisonKey(marketAddr);
  return (
    addressesEqual(marketAddr, m.market_addr) ||
    addressComparisonKey(m.market_addr) === key ||
    addressComparisonKey(subaccountAddr) === addressComparisonKey(x.owner)
  );
}
